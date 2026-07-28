import { ClerkProvider, SignIn, UserButton } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import type { ReactNode } from 'react';

/**
 * Clerk hosts the user directory and the sign-in UI. The session token it
 * mints is what the API's @clerk/express middleware verifies, so nothing
 * here needs a signing secret.
 */
export const AUTH_ID: string = 'clerk';

export function Provider({ children }: { children: ReactNode }) {
  return <ClerkProvider>{children}</ClerkProvider>;
}

export function SignInPanel() {
  // Hash routing keeps sign-in on one page — no catch-all route needed.
  return <SignIn routing="hash" />;
}

export async function renderAccountBadge(): Promise<ReactNode> {
  const { userId } = await auth();
  return userId ? <UserButton /> : null;
}

export async function getAccessToken(): Promise<string | null> {
  const { getToken } = await auth();
  return (await getToken()) ?? null;
}
