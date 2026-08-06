/**
 * The single time source for auth logic.
 *
 * Token expiry, session idle/absolute windows and attempt lockouts all read
 * the time through here, so a test drives them with `setClock` rather than
 * patching the system clock. Nothing under src/services reads `new Date()`
 * directly — that is the entire point of this file.
 *
 * Same seam idiom as src/core/auth.ts: a module-level value plus a setter,
 * resolved at call time so import order never matters.
 */
let clock: () => Date = () => new Date();

export function now(): Date {
  return clock();
}

/** Epoch seconds — the unit jose takes for explicit `iat`/`exp`. */
export function nowSeconds(): number {
  return Math.floor(clock().getTime() / 1000);
}

/** Swap the clock in tests. Called with no argument, restores the real one. */
export function setClock(fn?: () => Date): void {
  clock = fn ?? (() => new Date());
}
