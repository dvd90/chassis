import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

/**
 * Example table. Replace or extend with your own — then generate a
 * migration (see docs/guides/database.md) and run it.
 */
export const examples = sqliteTable('examples', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull()
});
