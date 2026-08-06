'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

/**
 * Sign in by emailed link. Asking for one is deliberately unrevealing: the API
 * answers the same way for every address, so this form does too — it never
 * says whether an account exists.
 *
 * The second step accepts the six-digit code, which is what makes this work
 * when the email is opened on a different device than the one being signed in.
 */
export function MagicForm() {
  const router = useRouter();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function requestLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const email = String(new FormData(event.currentTarget).get('email'));
    const res = await fetch('/api/session/magic', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email })
    });

    setPending(false);

    if (!res.ok) {
      setError('Too many requests. Try again in a few minutes.');
      return;
    }

    setSentTo(email);
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const code = String(new FormData(event.currentTarget).get('code'));
    const res = await fetch('/api/session/magic', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: sentTo, code })
    });

    setPending(false);

    if (!res.ok) {
      setError('That code is not valid. Request a new link.');
      return;
    }

    router.push('/account');
    router.refresh();
  }

  if (sentTo) {
    return (
      <form className="card" onSubmit={submitCode}>
        <div className="card-head">
          <h2>Check your email</h2>
          <span className="pill">magic link</span>
        </div>

        <p className="hint">
          If <strong>{sentTo}</strong> can sign in, a link is on its way. Open
          it on this device — or enter the code below if you opened it
          elsewhere.
        </p>

        <label className="field">
          <span>Code</span>
          <input
            name="code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            required
            autoComplete="one-time-code"
            placeholder="123456"
          />
        </label>

        {error && (
          <p role="alert">
            <span className="dot" />
            {error}
          </p>
        )}

        <button type="submit" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in with code'}
        </button>

        <button
          type="button"
          className="button-ghost"
          onClick={() => setSentTo(null)}
        >
          Use a different address
        </button>
      </form>
    );
  }

  return (
    <form className="card" onSubmit={requestLink}>
      <div className="card-head">
        <h2>Sign in</h2>
        <span className="pill">magic link</span>
      </div>

      <label className="field">
        <span>Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="dev@example.com"
        />
      </label>

      {error && (
        <p role="alert">
          <span className="dot" />
          {error}
        </p>
      )}

      <button type="submit" disabled={pending}>
        {pending ? 'Sending…' : 'Email me a link'}
      </button>

      <p className="hint">The link signs you in — nothing to remember.</p>
    </form>
  );
}
