'use client';

import { useRouter } from 'next/navigation';
import { signInForms } from './jwt.forms';

/**
 * The sign-in panel: whichever forms this project was scaffolded with. Two
 * were kept, two render; one was kept, one renders. This file holds no
 * `chassis:` markers by design — see ./jwt.forms.ts.
 */
export function SignInForm() {
  return (
    <>
      {signInForms.map((Form, index) => (
        <Form key={index} />
      ))}
    </>
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
