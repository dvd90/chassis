import { eq } from 'drizzle-orm';
import { now } from '../../utils/clock';
import { db } from './index';
import { users } from './schema';

/**
 * SQLite-backed identity store for local auth. Shape-compatible with
 * `UserStore` in ../users.ts — it is imported there by feature flag, and
 * declares no dependency back on it so this file stands alone when a
 * different auth provider is scaffolded.
 */
function toStored(row: { id: number; email: string; verifiedAt: string | null }) {
  return { id: String(row.id), email: row.email, verifiedAt: row.verifiedAt };
}

export const sqliteUsers = {
  async findByEmail(email: string) {
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    return row ? toStored(row) : null;
  },

  async findById(id: string) {
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.id, Number(id)))
      .limit(1);

    return row ? toStored(row) : null;
  },

  async create(email: string) {
    const [row] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        createdAt: now().toISOString()
      })
      .returning();

    return { id: String(row.id), email: row.email };
  },

  async markVerified(id: string, at: Date) {
    await db
      .update(users)
      .set({ verifiedAt: at.toISOString() })
      .where(eq(users.id, Number(id)));
  }
};
