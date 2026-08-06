import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

/**
 * Magic-link credentials — a credentials table, so both the link token and the
 * fallback code are stored only as SHA-256 digests. One row holds both,
 * because they share an expiry and are voided together.
 *
 * Kept in its own file so the whole table can be pruned by the single marked
 * re-export line in schema.ts.
 */
export const magicCredentials = sqliteTable('magic_credentials', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  returnTo: text('return_to'),
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at').notNull(),
  consumedAt: text('consumed_at'),
  voidedAt: text('voided_at')
});
