import { logger } from '../utils/logger';
import { pingPostgres, closePostgres } from '../db/postgres';

/** Enabled when DATABASE_URL is set. */
export async function initPostgres(): Promise<void> {
  const ok = await pingPostgres();
  if (!ok) throw new Error('Postgres is not reachable at DATABASE_URL');
  logger.info('✅ Postgres connected');
}

export async function isPostgresReady(): Promise<boolean> {
  return pingPostgres();
}

export { closePostgres };
