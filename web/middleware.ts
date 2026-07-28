export { middleware } from './auth/active-middleware';

/**
 * Matches every page route and no static asset. Clerk and Auth0 both need
 * their middleware on all pages — Clerk to establish the request context
 * `auth()` reads, Auth0 to mount its /auth/* routes — so the matcher is
 * deliberately wide and each provider decides what to actually guard.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
