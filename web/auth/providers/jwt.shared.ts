/**
 * Shared between the server component, the client forms, the route handlers
 * and the middleware, none of which can safely import the others' modules.
 *
 * Both tokens live in httpOnly cookies set by /api/session — never in
 * localStorage, so a script injected into the page cannot read them.
 */
export const TOKEN_COOKIE = 'chassis_token';
export const REFRESH_COOKIE = 'chassis_refresh';

/** Matches ACCESS_TTL_SECONDS in the API's session service. */
export const ACCESS_MAX_AGE = 15 * 60;

/** Matches SESSION_IDLE in the API's environment. */
export const REFRESH_MAX_AGE = 30 * 24 * 60 * 60;

export const API_URL = process.env.API_URL ?? 'http://localhost:8000';

/** Cookie options both tokens share. */
export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge
  };
}
