import { NextResponse, type NextRequest } from 'next/server';
import { TOKEN_COOKIE } from './jwt.shared';

const PROTECTED = ['/account'];

/**
 * Presence check only — the cookie's signature is verified by the API on
 * every request. Middleware here just avoids rendering a page that is
 * certain to fail, so it deliberately does not hold the signing secret.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!PROTECTED.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  if (request.cookies.get(TOKEN_COOKIE)?.value) return NextResponse.next();

  const signIn = new URL('/sign-in', request.url);
  signIn.searchParams.set('next', pathname);
  return NextResponse.redirect(signIn);
}
