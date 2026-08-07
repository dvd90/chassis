import { eq } from 'drizzle-orm';
import { db } from './index';
import { users } from './schema';

/**
 * Postgres-backed password hashes. The hash lives on the identity row, but
 * reaching it goes through this file so that scaffolding without the password
 * module removes every reference to it — see ../passwords.ts.
 */
export const postgresPasswords = {
  async get(userId: string) {
    const [row] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, Number(userId)))
      .limit(1);

    return row?.passwordHash ?? null;
  },

  async set(userId: string, hash: string) {
    await db
      .update(users)
      .set({ passwordHash: hash })
      .where(eq(users.id, Number(userId)));
  }
};
