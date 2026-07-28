import { NextResponse } from 'next/server';
import { TOKEN_COOKIE } from '@/auth/providers/jwt.shared';

const API_URL = process.env.API_URL ?? 'http://localhost:8000';
const ONE_HOUR = 60 * 60;

/**
 * The local-JWT session endpoint (this file ships only with `--auth jwt`).
 *
 * It exists so the browser never holds the token in JavaScript: credentials
 * are exchanged at the API's POST /auth/login here on the server, and the
 * token comes back to the browser only as an httpOnly cookie.
 */
export async function POST(request: Request) {
  const credentials = await request.json().catch(() => null);
  if (!credentials) {
    return NextResponse.json({ message: 'Invalid request' }, { status: 400 });
  }

  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(credentials)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json(data, { status: res.status });

  const response = NextResponse.json({ user: data.user });
  response.cookies.set(TOKEN_COOKIE, data.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // Matches TOKEN_TTL in the API's Auth controller.
    maxAge: ONE_HOUR
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(TOKEN_COOKIE);
  return response;
}
