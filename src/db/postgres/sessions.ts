import { and, eq, isNull } from 'drizzle-orm';
import { db } from './index';
import { refreshTokens } from './schema';

/**
 * Postgres-backed refresh tokens. Shape-compatible with `RefreshTokenStore` in
 * ../sessions.ts, which imports it by feature flag; nothing here depends on
 * that file, so it stands alone when a different auth provider is scaffolded.
 */
type Row = typeof refreshTokens.$inferSelect;

function toToken(row: Row) {
  return {
    id: String(row.id),
    familyId: row.familyId,
    userId: String(row.userId),
    expiresAt: row.expiresAt.toISOString(),
    familyCreatedAt: row.familyCreatedAt.toISOString(),
    rotatedAt: row.rotatedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null
  };
}

export const postgresSessions = {
  async insert(token: {
    familyId: string;
    userId: string;
    tokenHash: string;
    createdAt: Date;
    expiresAt: Date;
    familyCreatedAt: Date;
  }) {
    await db.insert(refreshTokens).values({
      familyId: token.familyId,
      userId: Number(token.userId),
      tokenHash: token.tokenHash,
      createdAt: token.createdAt,
      expiresAt: token.expiresAt,
      familyCreatedAt: token.familyCreatedAt
    });
  },

  async findByHash(tokenHash: string) {
    const [row] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);

    return row ? toToken(row) : null;
  },

  async markRotated(id: string, at: Date) {
    await db
      .update(refreshTokens)
      .set({ rotatedAt: at })
      .where(eq(refreshTokens.id, Number(id)));
  },

  async revokeFamily(familyId: string, at: Date) {
    await db
      .update(refreshTokens)
      .set({ revokedAt: at })
      .where(
        and(
          eq(refreshTokens.familyId, familyId),
          isNull(refreshTokens.revokedAt)
        )
      );
  },

  async revokeAllForUser(userId: string, at: Date) {
    await db
      .update(refreshTokens)
      .set({ revokedAt: at })
      .where(
        and(
          eq(refreshTokens.userId, Number(userId)),
          isNull(refreshTokens.revokedAt)
        )
      );
  }
};
