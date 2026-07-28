'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

/**
 * Credentials never reach the browser's JavaScript beyond this form: it
 * posts to /api/session, which calls the Chassis API and stores the
 * returned token in an httpOnly cookie the client cannot read.
 */
export function SignInForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: form.get('email'),
        password: form.get('password')
      })
    });

    setPending(false);

    if (!res.ok) {
      setError('Invalid email or password.');
      return;
    }

    router.push('/account');
    router.refresh();
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <div className="card-head">
        <h2>Sign in</h2>
        <span className="pill">jwt</span>
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

      <label className="field">
        <span>Password</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="current-password"
          placeholder="••••••••"
        />
      </label>

      {error && (
        <p role="alert">
          <span className="dot" />
          {error}
        </p>
      )}

      <button type="submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>

      <p className="hint">
        No account yet? <code>POST /auth/register</code> on the API creates one.
      </p>
    </form>
  );
}

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    await fetch('/api/session', { method: 'DELETE' });
    router.push('/');
    router.refresh();
  }

  return (
    <button type="button" className="button-ghost" onClick={signOut}>
      Sign out
    </button>
  );
}
