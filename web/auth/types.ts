import type { ReactNode } from 'react';

/**
 * The shape every auth provider module implements. create-chassis keeps one
 * provider and rewrites `auth/active.ts` to point at it, so all four must
 * stay interchangeable — `auth/providers/conformance.ts` enforces that at
 * typecheck time, in this repo, before any project is generated.
 */
export interface AuthModule {
  /**
   * Annotated `: string` in every provider on purpose. Left as a literal,
   * a generated project narrows it to (say) `'jwt'` and any
   * `AUTH_ID === 'none'` comparison becomes a compile error there — a
   * failure that cannot reproduce in this repo, where all four exist.
   */
  readonly AUTH_ID: string;
  /** Wraps the whole app in layout.tsx — for providers needing context. */
  Provider(props: { children: ReactNode }): ReactNode;
  /** The body of the /sign-in page. */
  SignInPanel(): ReactNode;
  /** Header slot: a sign-out control when signed in, nothing when not. */
  renderAccountBadge(): Promise<ReactNode>;
  /** Bearer token for the Chassis API, or null when signed out. */
  getAccessToken(): Promise<string | null>;
}
