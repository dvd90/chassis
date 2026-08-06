import type { RequestHandler } from 'express';
import { config } from '../config';

/**
 * Reject cross-site browser requests to endpoints that carry a cookie.
 *
 * The API is bearer-only everywhere except the session endpoints, which read
 * the refresh cookie — and a cookie is ambient credentials, which is what CSRF
 * exploits. `SameSite=Lax` already blocks the cross-site POST case in every
 * current browser; this is the belt to that pair of braces.
 *
 * A request with no `Origin` is allowed: that is a non-browser client (curl,
 * a server-side fetch, a mobile app), which sends no cookie it did not choose
 * to send and therefore cannot be tricked into one.
 *
 * Endpoints whose credential travels in the URL are deliberately NOT protected
 * by this: there the token itself is the credential, and it arrives by a
 * cross-site navigation out of a mail client by design.
 */
export const sameOrigin: RequestHandler = (req, _res, next) => {
  const site = req.headers['sec-fetch-site'];
  if (site === 'same-origin' || site === 'none') return next();

  const origin = req.headers.origin;
  if (!origin) return next();

  if (config.corsOrigins?.includes(origin)) return next();

  return req.resHandler.forbidden('Cross-origin request rejected');
};
