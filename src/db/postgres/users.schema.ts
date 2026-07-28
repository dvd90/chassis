import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Accounts for local-JWT auth. Kept in its own file so the whole table can
 * be pruned by the single marked re-export line in schema.ts. A marker on
 * the table itself would sit after an opening brace, where the formatter
 * moves it onto its own line and pruning would break the declaration.
 */
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});
