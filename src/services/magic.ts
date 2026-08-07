import { AppError, ERROR_CODES } from '../core';
import { config } from '../config';
import { logger } from '../utils/logger';
import { now } from '../utils/clock';
import { addTo } from '../utils/duration';
import { hashesEqual, randomCode, randomToken, sha256 } from '../utils/tokens';
import { magicStore } from '../db/magic';
import { userStore, type AuthUser } from '../db/users';
import { mailTransport } from '../mail';
import { magicEmail } from '../mail/template';
import { sendCodeBySms } from '../sms';

/**
 * Magic-link sign-in: a 256-bit link token and a 6-digit code, issued
 * together, hashed at rest, expiring together.
 *
 * The code is not a lesser alternative to the link — it is what makes the flow
 * work across devices. Someone requests a link on a desktop and opens the mail
 * on a phone; without a code, the desktop tab they are waiting on can never
 * complete. With one, they type six digits and carry on.
 */
export type MagicStatus = 'valid' | 'expired' | 'used';

/** A same-origin path: leading slash, then RFC 3986 path/query/fragment characters. */
const SAFE_PATH = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#[\]]*$/;

export interface Redemption {
  user: AuthUser;
  returnTo: string | null;
}

let onVerified: (identity: AuthUser) => void | Promise<void> = () => {};

/**
 * Called the first time an address is proven. This is the whole extension
 * surface, and it is deliberately the only one: marketing consent, welcome
 * sequences and double opt-in are product concerns, and Chassis holds no
 * opinion — or state — about any of them.
 */
export function setOnVerified(
  handler: (identity: AuthUser) => void | Promise<void>
): void {
  onVerified = handler;
}

/**
 * Decide where a redemption may send the browser.
 *
 * A redemption endpoint that trusts a stored path is the classic open-redirect
 * hole, so the default is the narrowest thing that is still useful: a
 * same-origin path. Absolute URLs need their origin listed in
 * MAGIC_RETURN_TO_ORIGINS. Validated when the link is requested, stored, and
 * validated again on the way out — a value that was safe at issue time is not
 * assumed to still be allowed.
 */
export function validateReturnTo(value?: string | null): string | null {
  if (!value) return null;

  // `//evil.com` is protocol-relative — a fully off-site redirect that merely
  // looks like a path. Checked before SAFE_PATH, which would happily accept
  // those leading slashes.
  if (value.startsWith('//')) return null;

  // Deny by default: only RFC 3986 path characters get through. That rules out
  // control characters, spaces and backslashes without enumerating them — and
  // those matter, because a newline can split the Location header and browsers
  // normalise `\` to `/`, making `/\evil.com` another way to write `//`.
  if (SAFE_PATH.test(value)) return value;

  const allowed =
    config.magicReturnTo.origins
      ?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [];

  try {
    const url = new URL(value);
    return allowed.includes(url.origin) ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Issue a fresh credential pair, voiding every outstanding one for the
 * address. Latest-wins: asking for a new link invalidates the previous link
 * *and* its code, so a forwarded old email cannot be used.
 */
export async function issue(
  email: string,
  returnTo: string | null
): Promise<{ token: string; code: string }> {
  const store = magicStore();
  const at = now();

  await store.voidAllForEmail(email, at);

  const token = randomToken();
  const code = randomCode();

  await store.insert({
    email,
    tokenHash: sha256(token),
    codeHash: sha256(code),
    returnTo,
    createdAt: at,
    expiresAt: addTo(at, config.magic.tokenTtl)
  });

  return { token, code };
}

/**
 * Issue and deliver. Callers run this *after* responding, so that the reply to
 * a magic-link request is identically shaped and identically timed whether or
 * not the address is known.
 */
export async function deliver(
  email: string,
  returnTo: string | null
): Promise<void> {
  const { token, code } = await issue(email, returnTo);
  const link = `${config.magicLink.base}/auth/magic/${token}`;

  await mailTransport().send({
    to: email,
    ...magicEmail({ link, code, expiresIn: config.magic.tokenTtl })
  });

  // A no-op unless the product bound a gateway and a recipient resolver.
  await sendCodeBySms(
    await userStore().findByEmail(email),
    `Your sign-in code is ${code}`
  );
}

/**
 * Inspect a link without consuming it.
 *
 * GET and HEAD must never spend a token: corporate mail security scanners
 * (Outlook SafeLinks and friends) prefetch every link they see, and a
 * single-use token consumed by a scanner is the most common way a magic-link
 * implementation breaks in production. Redemption happens on a user gesture,
 * via POST.
 */
export async function probe(
  token: string
): Promise<{ status: MagicStatus; returnTo: string | null }> {
  const record = await magicStore().findByTokenHash(sha256(token));

  // An unknown token is indistinguishable from one already redeemed and
  // cleaned up, and both need the same "request a new link" screen.
  if (!record) return { status: 'used', returnTo: null };
  if (record.consumedAt || record.voidedAt) {
    return { status: 'used', returnTo: null };
  }
  if (new Date(record.expiresAt) <= now()) {
    return { status: 'expired', returnTo: null };
  }

  return { status: 'valid', returnTo: validateReturnTo(record.returnTo) };
}

/** Spend a link token. Single use. */
export async function redeemToken(token: string): Promise<Redemption> {
  const store = magicStore();
  const at = now();
  const record = await store.findByTokenHash(sha256(token));

  if (!record || record.consumedAt || record.voidedAt) {
    throw new AppError(
      ERROR_CODES.WRONG_TOKEN,
      'This link has already been used. Request a new one.'
    );
  }

  if (new Date(record.expiresAt) <= at) {
    throw new AppError(
      ERROR_CODES.WRONG_TOKEN,
      'This link has expired. Request a new one.'
    );
  }

  await store.markConsumed(record.id, at);
  return complete(record.email, record.returnTo, at);
}

/** Spend the fallback code. Same outcome as the link path. */
export async function redeemCode(
  email: string,
  code: string
): Promise<Redemption> {
  const store = magicStore();
  const at = now();
  const record = await store.findLiveByEmail(email);

  // One error for every failure mode, so a wrong code cannot be told apart
  // from an unknown address.
  const failure = new AppError(
    ERROR_CODES.WRONG_TOKEN,
    'That code is not valid. Request a new link.'
  );

  if (!record || new Date(record.expiresAt) <= at) throw failure;

  if (!hashesEqual(record.codeHash, sha256(code))) {
    if (record.attempts + 1 >= config.magic.attempts) {
      // Cap reached: void the link as well as the code. Someone guessing at
      // six digits should not get to keep the link that came with them.
      await store.voidAllForEmail(email, at);
    } else {
      await store.bumpAttempts(record.id);
    }
    throw failure;
  }

  await store.markConsumed(record.id, at);
  return complete(record.email, record.returnTo, at);
}

/**
 * Resolve the identity behind a proven address.
 *
 * An unknown address is created here rather than at request time, which is
 * what lets the request endpoint answer identically for every address without
 * lying: sign-up and sign-in are one flow. A product that wants invitations
 * only should reject unknown addresses on this line.
 */
async function complete(
  email: string,
  returnTo: string | null,
  at: Date
): Promise<Redemption> {
  const users = userStore();
  const existing = await users.findByEmail(email);
  const user = existing ?? (await users.create(email));

  if (!existing?.verifiedAt) {
    await users.markVerified(user.id, at);
    try {
      await onVerified(user);
    } catch (error) {
      // A failing product hook must not cost someone their sign-in.
      logger.error('onVerified hook failed', {
        identityId: user.id,
        error: (error as Error).message
      });
    }
  }

  return { user, returnTo: validateReturnTo(returnTo) };
}
