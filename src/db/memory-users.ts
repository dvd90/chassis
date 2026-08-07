import { config } from '../config';
import type { AuthUser, StoredUser, UserStore } from './users';

/**
 * In-memory identity store — the fallback when no database is configured.
 *
 * ponytail: process-local and non-persistent by design. It exists so that
 * local auth still boots and signs in during development; pick a database
 * (the store then follows it automatically, see ./users.ts) before putting
 * this in front of real users.
 *
 * Set AUTH_DEV_EMAIL to seed a single identity at boot.
 */
const users = new Map<string, StoredUser>();
let nextId = 1;
let seeded = false;

function insert(email: string): StoredUser {
  const key = email.toLowerCase();
  const user: StoredUser = { id: String(nextId++), email: key, verifiedAt: null };
  users.set(key, user);
  return user;
}

function seed(): void {
  if (seeded) return;
  seeded = true;
  if (config.authDev.email) insert(config.authDev.email);
}

export const memoryUsers: UserStore = {
  async findByEmail(email: string): Promise<StoredUser | null> {
    seed();
    return users.get(email.toLowerCase()) ?? null;
  },

  async findById(id: string): Promise<StoredUser | null> {
    seed();
    for (const user of users.values()) {
      if (user.id === id) return user;
    }
    return null;
  },

  async create(email: string): Promise<AuthUser> {
    seed();
    const user = insert(email);
    return { id: user.id, email: user.email };
  },

  async markVerified(id: string, at: Date): Promise<void> {
    seed();
    for (const user of users.values()) {
      if (user.id === id) user.verifiedAt = at.toISOString();
    }
  }
};

/** Test-only: forget every seeded and created identity. */
export function resetMemoryUsers(): void {
  users.clear();
  nextId = 1;
  seeded = false;
}

/** The dev identity's id, if AUTH_DEV_EMAIL seeded one. */
export function devUserId(): string | undefined {
  seed();
  const email = config.authDev.email?.toLowerCase();
  return email ? users.get(email)?.id : undefined;
}
