import type { ComponentType } from 'react';
import { PasswordForm } from './jwt.password-form'; // chassis:password
import { MagicForm } from './jwt.magic-form'; // chassis:magic

/**
 * Which sign-in forms this project ships.
 *
 * The markers live here, in a `.ts` file, rather than on the JSX that renders
 * them. Pruning is line-based, and a marker inside JSX would have to sit in a
 * `{/* ... *\/}` comment — which the pruner's end-of-line pattern does not
 * match, so it would survive into generated projects. Keeping every marker in
 * plain TypeScript keeps `.tsx` free of them entirely; a test in
 * cli/scaffold.test.mjs enforces that.
 *
 * Removing either entry leaves valid TypeScript — a trailing comma and a
 * single remaining element both parse.
 */
export const signInForms: ComponentType[] = [
  PasswordForm, // chassis:password
  MagicForm // chassis:magic
];
