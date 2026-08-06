import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual
} from 'node:crypto';

/**
 * Credential generation and hashing, shared by every module that issues a
 * bearer secret. All of them are credentials tables: the raw value exists only
 * where it was handed out, and only its SHA-256 is ever stored.
 */

/** 256 bits, URL-safe — long enough that guessing is not a threat model. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Six digits, zero-padded — the cross-device fallback code. */
export function randomCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** What goes in the database. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Constant-time comparison of two SHA-256 hex digests.
 *
 * Hashing first is what makes this safe to do at all: digests are always the
 * same length, so `timingSafeEqual` never throws and the length itself leaks
 * nothing about the secret.
 */
export function hashesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}
