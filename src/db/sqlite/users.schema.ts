import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

/**
 * Identities for local auth. Kept in its own file so the whole table can be
 * pruned by the single marked re-export line in schema.ts. A marker on the
 * table itself would sit after an opening brace, where the formatter moves it
 * onto its own line and pruning would break the declaration.
 *
 * One column carries a marker and is therefore nullable: an identity created
 * by a module that stores no credential simply leaves it empty, and declining
 * that module drops the column outright.
 */
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'), // chassis:password
  verifiedAt: text('verified_at'),
  createdAt: text('created_at').notNull()
});
