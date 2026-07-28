import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { SignInForm, SignOutButton } from './jwt.client';
import { TOKEN_COOKIE } from './jwt.shared';

/**
 * Local JWT — the only provider where this project owns the credentials.
 * Sign-in posts to /api/session, which exchanges them at the API's
 * POST /auth/login and stores the returned token in an httpOnly cookie.
 */
export const AUTH_ID: string = 'jwt';

export function Provider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function SignInPanel() {
  return <SignInForm />;
}

export async function renderAccountBadge(): Promise<ReactNode> {
  const token = await getAccessToken();
  return token ? <SignOutButton /> : null;
}

export async function getAccessToken(): Promise<string | null> {
  return (await cookies()).get(TOKEN_COOKIE)?.value ?? null;
}
