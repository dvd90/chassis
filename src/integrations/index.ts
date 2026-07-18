import { config } from '../config';
import { logger } from '../utils/logger';
import { initMongo, closeMongo } from './mongo'; // chassis:mongo
import { initPostgres, closePostgres } from './postgres'; // chassis:postgres
import { initSqlite, closeSqlite } from './sqlite'; // chassis:sqlite
import { initAuth0 } from './auth0'; // chassis:auth0
import { initJwt } from './jwt'; // chassis:jwt
import { initClerk } from './clerk'; // chassis:clerk
import { initSentry } from './sentry'; // chassis:sentry
import { initX402 } from './x402'; // chassis:x402

/**
 * Integrations are strictly opt-in: each one initializes only when its
 * environment variables are present (see src/config). With no env vars
 * set, the server boots with zero external dependencies.
 */
export async function initIntegrations(): Promise<void> {
  if (config.features.sentry) initSentry(); // chassis:sentry
  if (config.features.auth0) initAuth0(); // chassis:auth0
  if (config.features.jwt) initJwt(); // chassis:jwt
  if (config.features.clerk) initClerk(); // chassis:clerk
  if (config.features.x402) initX402(); // chassis:x402
  if (config.features.mongo) await initMongo(); // chassis:mongo
  if (config.features.postgres) await initPostgres(); // chassis:postgres
  if (config.features.sqlite) initSqlite(); // chassis:sqlite

  const enabled = Object.entries(config.features)
    .filter(([, on]) => on)
    .map(([name]) => name);

  logger.info(
    enabled.length
      ? `Integrations enabled: ${enabled.join(', ')}`
      : 'No integrations configured — running standalone'
  );
}

export async function shutdownIntegrations(): Promise<void> {
  if (config.features.mongo) await closeMongo(); // chassis:mongo
  if (config.features.postgres) await closePostgres(); // chassis:postgres
  if (config.features.sqlite) closeSqlite(); // chassis:sqlite
}
