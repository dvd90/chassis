import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { config } from '../../config';
import * as schema from './schema';

// better-sqlite3 opens the file synchronously on construction; SQLITE_PATH
// defaults to ':memory:' so importing `db` is harmless when unconfigured.
const sqlite = new Database(config.sqlite.path);

export const db = drizzle(sqlite, { schema });
export { schema };

export function pingSqlite(): boolean {
  try {
    sqlite.prepare('select 1').get();
    return true;
  } catch {
    return false;
  }
}

export function closeSqlite(): void {
  sqlite.close();
}
