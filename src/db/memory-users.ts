import { config } from '../config';
import { hashPassword } from '../utils/password';
import type { AuthUser, StoredUser, UserStore } from './users';

/**
 * In-memory user store — the fallback when no database is configured.
 *
 * ponytail: process-local and non-persistent by design. It exists so that
 * `--auth jwt --db none` still boots and logs in during development; pick a
 * database (the store then follows it automatically, see ./users.ts) before
 * putting local-JWT auth in front of real users.
 *
 * Set AUTH_DEV_EMAIL / AUTH_DEV_PASSWORD to seed a single account at boot.
 */
const users = new Map<string, StoredUser>();
let nextId = 1;
let seeding: Promise<void> | undefined;

function seed(): Promise<void> {
  seeding ??= (async () => {
    const { email, password } = config.authDev;
    if (!email || !password) return;
    const key = email.toLowerCase();
    users.set(key, {
      id: String(nextId++),
      email: key,
      passwordHash: await hashPassword(password)
    });
  })();
  return seeding;
}

export const memoryUsers: UserStore = {
  async findByEmail(email: string): Promise<StoredUser | null> {
    await seed();
    return users.get(email.toLowerCase()) ?? null;
  },

  async create(email: string, passwordHash: string): Promise<AuthUser> {
    await seed();
    const key = email.toLowerCase();
    const user: StoredUser = { id: String(nextId++), email: key, passwordHash };
    users.set(key, user);
    return { id: user.id, email: user.email };
  }
};
