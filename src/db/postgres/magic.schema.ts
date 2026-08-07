import { pgTable, serial, text, timestamp, integer } from 'drizzle-orm/pg-core';

/**
 * Magic-link credentials — a credentials table, so both the link token and the
 * fallback code are stored only as SHA-256 digests. One row holds both,
 * because they share an expiry and are voided together.
 *
 * Kept in its own file so the whole table can be pruned by the single marked
 * re-export line in schema.ts.
 */
export const magicCredentials = pgTable('magic_credentials', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').default(0).notNull(),
  returnTo: text('return_to'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  consumedAt: timestamp('consumed_at'),
  voidedAt: timestamp('voided_at')
});
