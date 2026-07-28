/**
 * Shared between the server component, the client form and the middleware,
 * none of which can safely import the others' modules.
 *
 * The token lives in an httpOnly cookie set by /api/session — never in
 * localStorage, so a script injected into the page cannot read it.
 */
export const TOKEN_COOKIE = 'chassis_token';
