import { describe, expect, it } from 'vitest';
import { db, pingSqlite } from './index';

// Co-located with src/db/sqlite so it is pruned together when SQLite is
// declined. SQLite runs in-memory by default, so this needs no infrastructure.
describe('sqlite', () => {
  it('opens an in-memory database and pings', () => {
    expect(pingSqlite()).toBe(true);
    expect(db).toBeDefined();
  });
});
