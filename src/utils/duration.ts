/**
 * `'15m'` → `900`. Durations live in the environment as strings
 * (`MAGIC_TOKEN_TTL`, `SESSION_IDLE`, ...) and are parsed where they are used.
 *
 * ponytail: its own file rather than a helper inside src/config. Scaffolding
 * away the modules that use durations would leave such a helper unused, and
 * `noUnusedLocals` turns an unused local into a build failure.
 */
import { z } from 'zod';

const UNITS = { s: 1, m: 60, h: 3600, d: 86400 } as const;

type Unit = keyof typeof UNITS;

/**
 * The env-schema form, so a bad duration fails at boot rather than at the
 * first sign-in. It lives here rather than inline in src/config because
 * `z.string().regex(...).default(...)` plus a trailing `chassis:` marker
 * exceeds the print width, and Prettier then splits the chain across four
 * lines — leaving the marker on the last one, where pruning it would delete
 * `.default(...)` and break the declaration.
 */
export function durationSchema(fallback: string): z.ZodDefault<z.ZodString> {
  return z
    .string()
    .regex(/^\d+[smhd]$/, 'expected a duration like "15m" or "30d"')
    .default(fallback);
}

export function seconds(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) {
    throw new Error(
      `Invalid duration "${value}" — expected <number><s|m|h|d>, e.g. "15m"`
    );
  }
  return Number(match[1]) * UNITS[match[2] as Unit];
}

/** The instant `value` after `from` — for expiry columns. */
export function addTo(from: Date, value: string): Date {
  return new Date(from.getTime() + seconds(value) * 1000);
}
