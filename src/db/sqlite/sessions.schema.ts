import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

/**
 * Refresh tokens — one row per issued token, never updated in place except to
 * mark it spent or revoked. Kept in its own file so the whole table can be
 * pruned by the single marked re-export line in schema.ts.
 *
 * `family_id` groups every token descended from one sign-in, so presenting an
 * already-rotated token can revoke the whole lineage. `family_created_at` is
 * denormalized onto every row so the absolute window needs no second table.
 */
export const refreshTokens = sqliteTable('refresh_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  familyId: text('family_id').notNull(),
  userId: text('user_id').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at').notNull(),
  familyCreatedAt: text('family_created_at').notNull(),
  rotatedAt: text('rotated_at'),
  revokedAt: text('revoked_at')
});
