import { config } from '../config';
import { logger } from '../utils/logger';
import { initMongo, closeMongo } from './mongo'; // chassis:mongo
import { initAuth0 } from './auth0'; // chassis:auth0
import { initSentry } from './sentry'; // chassis:sentry

/**
 * Integrations are strictly opt-in: each one initializes only when its
 * environment variables are present (see src/config). With no env vars
 * set, the server boots with zero external dependencies.
 */
export async function initIntegrations(): Promise<void> {
  if (config.features.sentry) initSentry(); // chassis:sentry
  if (config.features.auth0) initAuth0(); // chassis:auth0
  if (config.features.mongo) await initMongo(); // chassis:mongo

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
}
