import { and, eq, isNull } from 'drizzle-orm';
import { db } from './index';
import { refreshTokens } from './schema';

/**
 * SQLite-backed refresh tokens. Shape-compatible with `RefreshTokenStore` in
 * ../sessions.ts, which imports it by feature flag; nothing here depends on
 * that file, so it stands alone when a different auth provider is scaffolded.
 */
type Row = typeof refreshTokens.$inferSelect;

function toToken(row: Row) {
  return {
    id: String(row.id),
    familyId: row.familyId,
    userId: row.userId,
    expiresAt: row.expiresAt,
    familyCreatedAt: row.familyCreatedAt,
    rotatedAt: row.rotatedAt,
    revokedAt: row.revokedAt
  };
}

export const sqliteSessions = {
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
      userId: token.userId,
      tokenHash: token.tokenHash,
      createdAt: token.createdAt.toISOString(),
      expiresAt: token.expiresAt.toISOString(),
      familyCreatedAt: token.familyCreatedAt.toISOString()
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
      .set({ rotatedAt: at.toISOString() })
      .where(eq(refreshTokens.id, Number(id)));
  },

  async revokeFamily(familyId: string, at: Date) {
    await db
      .update(refreshTokens)
      .set({ revokedAt: at.toISOString() })
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
      .set({ revokedAt: at.toISOString() })
      .where(
        and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt))
      );
  }
};
