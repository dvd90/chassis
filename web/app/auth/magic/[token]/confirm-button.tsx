'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * The user gesture that actually spends the token. Posts to the API through
 * the session route so the resulting tokens land in httpOnly cookies.
 */
export function ConfirmButton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setPending(true);
    setError(null);

    const res = await fetch('/api/session/magic/redeem', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token })
    });

    setPending(false);

    if (!res.ok) {
      setError('That link could not be redeemed. Request a new one.');
      return;
    }

    const { returnTo } = (await res.json()) as { returnTo?: string | null };
    router.push(returnTo ?? '/account');
    router.refresh();
  }

  return (
    <>
      {error && (
        <p role="alert">
          <span className="dot" />
          {error}
        </p>
      )}
      <button type="button" onClick={confirm} disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </>
  );
}
