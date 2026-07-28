import type { ReactNode } from 'react';
import { auth0 } from './auth0.shared';

/**
 * Auth0 hosts the user directory. Its SDK mounts /auth/login, /auth/logout
 * and /auth/callback from the middleware, so those are plain links rather
 * than routes in this app.
 */
export const AUTH_ID: string = 'auth0';

export function Provider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function SignInPanel() {
  return (
    <div className="card">
      <div className="card-head">
        <h2>Sign in</h2>
        <span className="pill">auth0</span>
      </div>
      <p className="muted">
        Auth0 hosts the login page — you&apos;ll be redirected back here.
      </p>
      <a className="button" href="/auth/login">
        Continue with Auth0
      </a>
    </div>
  );
}

export async function renderAccountBadge(): Promise<ReactNode> {
  const session = await auth0()
    .getSession()
    .catch(() => null);
  return session ? (
    <a className="button button-ghost" href="/auth/logout">
      Sign out
    </a>
  ) : null;
}

export async function getAccessToken(): Promise<string | null> {
  try {
    const { token } = await auth0().getAccessToken();
    return token ?? null;
  } catch {
    // Signed out, or the refresh token expired — both mean "no token".
    return null;
  }
}
