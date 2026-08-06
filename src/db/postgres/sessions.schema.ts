import { pgTable, serial, text, timestamp, integer } from 'drizzle-orm/pg-core';

/**
 * Refresh tokens — one row per issued token, never updated in place except to
 * mark it spent or revoked. Kept in its own file so the whole table can be
 * pruned by the single marked re-export line in schema.ts.
 *
 * `family_id` groups every token descended from one sign-in, so presenting an
 * already-rotated token can revoke the whole lineage. `family_created_at` is
 * denormalized onto every row so the absolute window needs no second table.
 */
export const refreshTokens = pgTable('refresh_tokens', {
  id: serial('id').primaryKey(),
  familyId: text('family_id').notNull(),
  userId: integer('user_id').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  familyCreatedAt: timestamp('family_created_at').notNull(),
  rotatedAt: timestamp('rotated_at'),
  revokedAt: timestamp('revoked_at')
});
