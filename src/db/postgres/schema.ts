import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Example table. Replace or extend with your own — then generate a
 * migration (see docs/guides/database.md) and run it.
 */
export const examples = pgTable('examples', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export * from './users.schema'; // chassis:session
export * from './sessions.schema'; // chassis:session
export * from './magic.schema'; // chassis:magic
