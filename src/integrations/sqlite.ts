import { logger } from '../utils/logger';
import { pingSqlite, closeSqlite } from '../db/sqlite';

/** Enabled when SQLITE_PATH is set. */
export function initSqlite(): void {
  if (!pingSqlite()) throw new Error('SQLite database could not be opened');
  logger.info('✅ SQLite ready');
}

export function isSqliteReady(): boolean {
  return pingSqlite();
}

export { closeSqlite };
