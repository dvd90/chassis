import { NextResponse } from 'next/server';
import { API_URL } from '@/auth/providers/jwt.shared';
import { withSession } from '../route';

/**
 * Exchange credentials for a session, server-side.
 *
 * The point of the round trip is that the tokens never touch the page's
 * JavaScript: they come back only as httpOnly cookies, so an injected script
 * cannot read them.
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

  return withSession(data);
}
