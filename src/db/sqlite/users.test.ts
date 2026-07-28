import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from './index';
import { sqliteUsers } from './users';

/**
 * The Drizzle-backed user store behind local-JWT auth. Co-located with
 * src/db/sqlite so it is pruned with SQLite, and listed under the jwt
 * module so it is pruned with local JWT too.
 *
 * SQLite runs in-memory by default, so this needs no infrastructure — but
 * an in-memory database starts empty, hence the table is created here
 * rather than by a migration.
 */
beforeAll(() => {
  db.run(sql`
    create table users (
      id integer primary key autoincrement,
      email text not null unique,
      password_hash text not null,
      created_at text not null
    )
  `);
});

describe('sqliteUsers', () => {
  it('creates a user and returns its id and email', async () => {
    const user = await sqliteUsers.create('Dev@Example.com', 'scrypt$aa$bb');
    expect(user.email).toBe('dev@example.com');
    expect(user.id).toMatch(/^\d+$/);
  });

  it('finds a user case-insensitively and returns the hash', async () => {
    const found = await sqliteUsers.findByEmail('DEV@example.COM');
    expect(found?.email).toBe('dev@example.com');
    expect(found?.passwordHash).toBe('scrypt$aa$bb');
  });

  it('returns null for an unknown email', async () => {
    expect(await sqliteUsers.findByEmail('nobody@example.com')).toBeNull();
  });
});
