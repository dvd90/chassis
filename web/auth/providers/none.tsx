import type { ReactNode } from 'react';

/** No auth provider — every API call goes out unauthenticated. */
export const AUTH_ID: string = 'none';

export function Provider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function SignInPanel() {
  return (
    <div className="card">
      <div className="card-head">
        <h2>Sign in</h2>
        <span className="pill">none</span>
      </div>
      <p className="muted">This project was scaffolded without a provider.</p>
      <p className="hint">
        Re-run <code>create-chassis</code> with <code>--auth jwt</code>,{' '}
        <code>--auth auth0</code> or <code>--auth clerk</code>, or wire your own
        into <code>auth/providers/</code> and point <code>auth/active.ts</code>{' '}
        at it.
      </p>
    </div>
  );
}

export async function renderAccountBadge(): Promise<ReactNode> {
  return null;
}

export async function getAccessToken(): Promise<string | null> {
  return null;
}
