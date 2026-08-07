import { config } from '../config';
import { hashPassword } from '../utils/password';
import { devUserId } from './memory-users';
import type { PasswordStore } from './passwords';

/**
 * In-memory password hashes, paired with the in-memory identity store.
 *
 * Set AUTH_DEV_EMAIL and AUTH_DEV_PASSWORD to sign in with a single seeded
 * account during development. The identity comes from ./memory-users.ts; only
 * the hash is seeded here, lazily, so that hashing cost is paid on first use
 * rather than at boot.
 */
const hashes = new Map<string, string>();
let seeding: Promise<void> | undefined;

function seed(): Promise<void> {
  seeding ??= (async () => {
    const password = config.authDevPassword;
    const id = devUserId();
    if (!password || !id) return;
    hashes.set(id, await hashPassword(password));
  })();
  return seeding;
}

export const memoryPasswords: PasswordStore = {
  async get(userId: string): Promise<string | null> {
    await seed();
    return hashes.get(userId) ?? null;
  },

  async set(userId: string, hash: string): Promise<void> {
    await seed();
    hashes.set(userId, hash);
  }
};

/** Test-only: forget every seeded and stored hash. */
export function resetMemoryPasswords(): void {
  hashes.clear();
  seeding = undefined;
}
