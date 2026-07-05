import * as Sentry from '@sentry/node';
import { config } from '../config';
import { logger } from '../utils/logger';

/** Enabled when SENTRY_DSN is set. */
export function initSentry(): void {
  Sentry.init({
    dsn: config.sentry.dsn,
    environment: config.env
  });

  logger.info('✅ Sentry error reporting enabled');
}

/** No-ops harmlessly if Sentry.init was never called. */
export function captureException(err: unknown): void {
  Sentry.captureException(err);
}
