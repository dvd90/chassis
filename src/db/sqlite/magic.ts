import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from './index';
import { magicCredentials } from './schema';

/**
 * SQLite-backed magic-link credentials. Shape-compatible with `MagicStore` in
 * ../magic.ts, which imports it by feature flag; nothing here depends on that
 * file, so it stands alone when a different auth provider is scaffolded.
 */
type Row = typeof magicCredentials.$inferSelect;

function toCredential(row: Row) {
  return {
    id: String(row.id),
    email: row.email,
    codeHash: row.codeHash,
    attempts: row.attempts,
    returnTo: row.returnTo,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    voidedAt: row.voidedAt
  };
}

const live = (email: string) =>
  and(
    eq(magicCredentials.email, email.toLowerCase()),
    isNull(magicCredentials.consumedAt),
    isNull(magicCredentials.voidedAt)
  );

export const sqliteMagic = {
  async insert(credential: {
    email: string;
    tokenHash: string;
    codeHash: string;
    returnTo: string | null;
    createdAt: Date;
    expiresAt: Date;
  }) {
    await db.insert(magicCredentials).values({
      email: credential.email.toLowerCase(),
      tokenHash: credential.tokenHash,
      codeHash: credential.codeHash,
      returnTo: credential.returnTo,
      createdAt: credential.createdAt.toISOString(),
      expiresAt: credential.expiresAt.toISOString()
    });
  },

  async findByTokenHash(tokenHash: string) {
    const [row] = await db
      .select()
      .from(magicCredentials)
      .where(eq(magicCredentials.tokenHash, tokenHash))
      .limit(1);

    return row ? toCredential(row) : null;
  },

  async findLiveByEmail(email: string) {
    const [row] = await db
      .select()
      .from(magicCredentials)
      .where(live(email))
      .limit(1);

    return row ? toCredential(row) : null;
  },

  async markConsumed(id: string, at: Date) {
    await db
      .update(magicCredentials)
      .set({ consumedAt: at.toISOString() })
      .where(eq(magicCredentials.id, Number(id)));
  },

  async bumpAttempts(id: string) {
    await db
      .update(magicCredentials)
      .set({ attempts: sql`${magicCredentials.attempts} + 1` })
      .where(eq(magicCredentials.id, Number(id)));
  },

  async voidAllForEmail(email: string, at: Date) {
    await db
      .update(magicCredentials)
      .set({ voidedAt: at.toISOString() })
      .where(live(email));
  }
};
