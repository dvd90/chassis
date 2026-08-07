import { NextResponse } from 'next/server';
import { API_URL } from '@/auth/providers/jwt.shared';
import { withSession } from '../../route';

/**
 * Spend a link token and store the resulting session.
 *
 * Only reached from a button press on the confirmation page — never from
 * rendering it — which is what keeps link prefetching harmless.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.token) {
    return NextResponse.json({ message: 'Invalid request' }, { status: 400 });
  }

  const res = await fetch(`${API_URL}/auth/magic/redeem`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ token: body.token })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json(data, { status: res.status });

  const response = withSession(data);
  // The API already validated and re-validated this against the allowlist;
  // it is echoed back only so the client knows where to go next.
  return NextResponse.json(
    { user: data.user, returnTo: data.returnTo ?? null },
    { headers: response.headers }
  );
}
