import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { middleware } from './jwt.middleware';
import { TOKEN_COOKIE } from './jwt.shared';

/** Build a request for `path`, optionally carrying the session cookie. */
function requestFor(path: string, token?: string) {
  const request = new NextRequest(`http://localhost:3000${path}`);
  if (token) request.cookies.set(TOKEN_COOKIE, token);
  return request;
}

describe('local-JWT middleware', () => {
  it('redirects to sign-in when a protected page has no cookie', () => {
    const res = middleware(requestFor('/account'));
    expect(res.status).toBe(307);

    const location = new URL(res.headers.get('location') ?? '');
    expect(location.pathname).toBe('/sign-in');
    expect(location.searchParams.get('next')).toBe('/account');
  });

  it('lets a protected page through when the cookie is present', () => {
    const res = middleware(requestFor('/account', 'tok-123'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('leaves public pages alone', () => {
    for (const path of ['/', '/sign-in']) {
      expect(middleware(requestFor(path)).headers.get('location')).toBeNull();
    }
  });

  it('guards nested routes under a protected prefix', () => {
    const res = middleware(requestFor('/account/settings'));
    expect(res.status).toBe(307);
  });
});
