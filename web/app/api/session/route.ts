import { NextResponse } from 'next/server';
import {
  ACCESS_MAX_AGE,
  REFRESH_COOKIE,
  REFRESH_MAX_AGE,
  TOKEN_COOKIE,
  cookieOptions
} from '@/auth/providers/jwt.shared';

/**
 * The session boundary — the one place in the stack that sets cookies, which
 * is what lets the API stay a pure bearer-token service.
 *
 * Signing *in* is per-method and lives in the sibling routes, because which
 * of those exist depends on how the project was scaffolded. This file owns
 * what they have in common: turning an API auth response into httpOnly
 * cookies, and signing out.
 */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(TOKEN_COOKIE);
  response.cookies.delete(REFRESH_COOKIE);
  return response;
}

/** Store a session from any API auth response. */
export function withSession(
  data: { user?: unknown; accessToken?: string; refreshToken?: string },
  extra: Record<string, unknown> = {}
) {
  const response = NextResponse.json({ user: data.user, ...extra });

  if (data.accessToken) {
    response.cookies.set(
      TOKEN_COOKIE,
      data.accessToken,
      cookieOptions(ACCESS_MAX_AGE)
    );
  }

  if (data.refreshToken) {
    response.cookies.set(
      REFRESH_COOKIE,
      data.refreshToken,
      cookieOptions(REFRESH_MAX_AGE)
    );
  }

  return response;
}
