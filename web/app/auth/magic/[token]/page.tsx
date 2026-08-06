import Link from 'next/link';
import { API_URL } from '@/auth/providers/jwt.shared';
import { ConfirmButton } from './confirm-button';

/**
 * The confirmation step for an emailed link.
 *
 * Rendering this page only *probes* the token — it is never consumed here.
 * Mail security scanners prefetch links, and a single-use token spent by a
 * scanner is the most common way this flow breaks in production. Nothing is
 * redeemed until someone presses the button, which is a POST.
 *
 * Point MAGIC_LINK_BASE_URL at this app to use this page instead of the
 * API's own minimal one.
 */
export default async function MagicConfirmPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const res = await fetch(`${API_URL}/auth/magic/${token}`, {
    headers: { accept: 'application/json' },
    cache: 'no-store'
  });
  const { status } = (await res.json().catch(() => ({ status: 'used' }))) as {
    status: 'valid' | 'expired' | 'used';
  };

  if (status !== 'valid') {
    return (
      <main className="card">
        <h1>This link no longer works</h1>
        <p>
          {status === 'expired'
            ? 'It expired — links are short-lived on purpose.'
            : 'It has already been used.'}
        </p>
        <p className="hint">
          <Link href="/">Request a new one</Link> and it will arrive in a
          moment.
        </p>
      </main>
    );
  }

  return (
    <main className="card">
      <h1>Confirm sign-in</h1>
      <p>Press the button to finish signing in on this device.</p>
      <ConfirmButton token={token} />
    </main>
  );
}
