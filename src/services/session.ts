import type { Response } from 'express';
import { AppError, ERROR_CODES } from '../core';
import { config } from '../config';
import { now, nowSeconds } from '../utils/clock';
import { addTo, seconds } from '../utils/duration';
import { randomToken, sha256 } from '../utils/tokens';
import { sessionStore } from '../db/sessions';
import { userStore, type AuthUser } from '../db/users';

/**
 * The session layer: a short-lived access JWT plus a rotating refresh token.
 *
 * Refresh tokens are stored only as SHA-256 digests and rotated on every use.
 * Presenting a token that has already been rotated is treated as theft — the
 * whole family (every token descended from that sign-in) is revoked, which is
 * the only way a stolen-and-replayed token gets caught.
 *
 * Two windows bound a session: `SESSION_IDLE` per token, renewed on each
 * rotation, and `SESSION_ABSOLUTE` measured from the sign-in itself. Both are
 * evaluated against the injected clock, never `new Date()`.
 */

/**
 * ponytail: a constant, not an env var. The session windows are configurable
 * because operators genuinely tune them; nobody tunes the access-token
 * lifetime, and a shorter one only ever costs one extra refresh.
 */
const ACCESS_TTL_SECONDS = 15 * 60;

export const REFRESH_COOKIE = 'chassis_refresh';

export interface Session {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** The signing key, or a 501 when the module is present but unconfigured. */
export function signingKey(): Uint8Array {
  if (!config.jwt.secret) {
    throw new AppError(
      ERROR_CODES.NOT_IMPLEMENTED,
      'Local auth is not configured. Set JWT_SECRET (see .env.example).'
    );
  }
  return new TextEncoder().encode(config.jwt.secret);
}

// ponytail: jose ships ESM only, so a CJS build can't statically import it.
// Back to a top-level import the day this package goes "type": "module".
async function mintAccessToken(user: AuthUser, familyId: string) {
  const { SignJWT } = await import('jose');
  const issuedAt = nowSeconds();

  return new SignJWT({ email: user.email, sid: familyId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    // Explicit epochs rather than jose's defaults, so the injected clock — not
    // the system clock — decides when a token expires. That is what makes
    // expiry testable.
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ACCESS_TTL_SECONDS)
    .sign(signingKey());
}

async function issueRefresh(
  user: AuthUser,
  familyId: string,
  familyCreatedAt: Date,
  at: Date
): Promise<Session> {
  const refreshToken = randomToken();

  await sessionStore().insert({
    familyId,
    userId: user.id,
    tokenHash: sha256(refreshToken),
    createdAt: at,
    expiresAt: addTo(at, config.session.idle),
    familyCreatedAt
  });

  return {
    user,
    accessToken: await mintAccessToken(user, familyId),
    refreshToken,
    expiresIn: ACCESS_TTL_SECONDS
  };
}

/**
 * Begin a new session family. Every authentication event calls this, whichever
 * sign-in method it was, so a fresh login never inherits an older lineage.
 */
export async function startSession(user: AuthUser): Promise<Session> {
  signingKey();
  const at = now();
  return issueRefresh(user, randomToken(), at, at);
}

const invalid = (message: string) =>
  new AppError(ERROR_CODES.WRONG_TOKEN, message);

/** Rotate a refresh token, or reject it and revoke its family. */
export async function refreshSession(rawToken: string): Promise<Session> {
  signingKey();
  const store = sessionStore();
  const at = now();
  const record = await store.findByHash(sha256(rawToken));

  if (!record || record.revokedAt) throw invalid('Invalid refresh token');

  if (record.rotatedAt) {
    // Already spent. Either the client replayed it or someone stole it — and
    // from here the two are indistinguishable, so assume the worse and take
    // the whole lineage down.
    await store.revokeFamily(record.familyId, at);
    throw invalid('Refresh token reuse detected — every session was revoked');
  }

  if (new Date(record.expiresAt) <= at) throw invalid('Session expired');

  const familyCreatedAt = new Date(record.familyCreatedAt);
  if (addTo(familyCreatedAt, config.session.absolute) <= at) {
    throw invalid('Session reached its maximum age — sign in again');
  }

  const user = await userStore().findById(record.userId);
  if (!user) throw invalid('Invalid refresh token');

  await store.markRotated(record.id, at);
  return issueRefresh(
    { id: user.id, email: user.email },
    record.familyId,
    familyCreatedAt,
    at
  );
}

/** Revoke one family. Idempotent: an unknown or spent token is still a 204. */
export async function endSession(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  const store = sessionStore();
  const record = await store.findByHash(sha256(rawToken));
  if (record) await store.revokeFamily(record.familyId, now());
}

/** Sign an identity out everywhere, on every device. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await sessionStore().revokeAllForUser(userId, now());
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: config.env === 'production',
    sameSite: 'lax',
    // Scoped to the auth endpoints: no other route has any use for it.
    path: '/auth',
    maxAge: seconds(config.session.idle) * 1000
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: '/auth' });
}
