import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtected = createRouteMatcher(['/account(.*)']);

/**
 * clerkMiddleware must run on every page route, not just protected ones —
 * `auth()` in a server component reads the request context it establishes.
 */
export const middleware = clerkMiddleware(async (auth, request) => {
  if (isProtected(request)) await auth.protect();
});
