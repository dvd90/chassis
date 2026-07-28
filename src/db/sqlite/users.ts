import { eq } from 'drizzle-orm';
import { db } from './index';
import { users } from './schema';

/**
 * SQLite-backed user store for local-JWT auth. Shape-compatible with
 * `UserStore` in ../users.ts — it is imported there by feature flag, and
 * declares no dependency back on it so this file stands alone when a
 * different auth provider is scaffolded.
 */
export const sqliteUsers = {
  async findByEmail(email: string) {
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    return row
      ? { id: String(row.id), email: row.email, passwordHash: row.passwordHash }
      : null;
  },

  async create(email: string, passwordHash: string) {
    const [row] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        createdAt: new Date().toISOString()
      })
      .returning();

    return { id: String(row.id), email: row.email };
  }
};
