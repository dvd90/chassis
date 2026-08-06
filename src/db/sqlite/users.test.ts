import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { setClock } from '../../utils/clock';
import { db } from './index';
import { sqliteUsers } from './users';

/**
 * The Drizzle-backed identity store. Co-located with src/db/sqlite so it is
 * pruned with SQLite, and listed under the session module so it is pruned with
 * local auth too.
 *
 * SQLite runs in-memory by default, so this needs no infrastructure — but an
 * in-memory database starts empty, hence the table is created here rather than
 * by a migration. The table mirrors the shared schema, including the nullable
 * credential column other modules own — filling it is their business, covered
 * by their own co-located tests.
 */
export const NOW = new Date('2026-03-01T09:00:00.000Z');

/**
 * Columns as data rather than one SQL string, so a column belonging to an
 * optional module can carry a `chassis:` marker on its own line. A marker
 * inside the SQL template literal could not: pruning is line-based, and SQL
 * comment syntax is not what the stripper removes.
 */
const COLUMNS = [
  'id integer primary key autoincrement',
  'email text not null unique',
  'password_hash text', // chassis:password
  'verified_at text',
  'created_at text not null'
];

export function createUsersTable(): void {
  db.run(sql.raw(`create table if not exists users (${COLUMNS.join(', ')})`));
}

beforeAll(() => {
  setClock(() => NOW);
  createUsersTable();
});

describe('sqliteUsers', () => {
  it('creates an identity and returns its id and email', async () => {
    const user = await sqliteUsers.create('Dev@Example.com');
    expect(user.email).toBe('dev@example.com');
    expect(user.id).toMatch(/^\d+$/);
  });

  it('finds an identity case-insensitively, unverified at first', async () => {
    const found = await sqliteUsers.findByEmail('DEV@example.COM');
    expect(found?.email).toBe('dev@example.com');
    expect(found?.verifiedAt).toBeNull();
  });

  it('finds by id', async () => {
    const created = await sqliteUsers.create('by-id@example.com');
    expect((await sqliteUsers.findById(created.id))?.email).toBe(
      'by-id@example.com'
    );
  });

  it('stamps verifiedAt from the injected clock', async () => {
    const user = await sqliteUsers.create('verify@example.com');
    await sqliteUsers.markVerified(user.id, NOW);
    const found = await sqliteUsers.findByEmail('verify@example.com');
    expect(found?.verifiedAt).toBe(NOW.toISOString());
  });

  it('returns null for an unknown email', async () => {
    expect(await sqliteUsers.findByEmail('nobody@example.com')).toBeNull();
  });
});
