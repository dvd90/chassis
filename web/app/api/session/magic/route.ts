import { NextResponse } from 'next/server';
import { API_URL } from '@/auth/providers/jwt.shared';
import { withSession } from '../route';

/**
 * The magic-link half of the session boundary.
 *
 * POST asks the API to email a link; PUT exchanges the six-digit code for a
 * session. Both proxy through the server so the resulting tokens land in
 * httpOnly cookies rather than in the page's JavaScript.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.email) {
    return NextResponse.json({ message: 'Invalid request' }, { status: 400 });
  }

  const res = await fetch(`${API_URL}/auth/magic/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: body.email, returnTo: '/account' })
  });

  // Pass the API's answer through unchanged. It is identical for every
  // address by design, and re-shaping it here would be the one place that
  // leaks whether an account exists.
  return NextResponse.json(await res.json().catch(() => ({})), {
    status: res.status
  });
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.code) {
    return NextResponse.json({ message: 'Invalid request' }, { status: 400 });
  }

  const res = await fetch(`${API_URL}/auth/magic/code`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ email: body.email, code: body.code })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json(data, { status: res.status });

  return withSession(data);
}
