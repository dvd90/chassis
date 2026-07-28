import type { NextRequest } from 'next/server';
import { auth0 } from './auth0.shared';

/**
 * Mounts Auth0's /auth/* routes and refreshes the session cookie. It has to
 * run on every request for those routes to exist at all.
 */
export function middleware(request: NextRequest) {
  return auth0().middleware(request);
}
