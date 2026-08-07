import * as Sentry from '@sentry/node';
import { config } from '../config';
import { logger } from '../utils/logger';

/** Enabled when SENTRY_DSN is set. */
export function initSentry(): void {
  Sentry.init({
    dsn: config.sentry.dsn,
    environment: config.env,
    // Must match the release the source maps were uploaded under, or the
    // stack traces stay minified. CI sets both to the commit SHA.
    release: config.sentry.release
  });

  logger.info('✅ Sentry error reporting enabled');
}

/** No-ops harmlessly if Sentry.init was never called. */
export function captureException(err: unknown): void {
  Sentry.captureException(err);
}

export interface CheckIn {
  ok(): void;
  error(): void;
}

/**
 * Open a Sentry Crons check-in for one job run.
 *
 * The point of check-ins over plain exception capture: Sentry knows the
 * schedule, so a run that never happens alerts too. A job that silently stops
 * being scheduled is the failure mode you would otherwise never hear about.
 *
 * No-ops harmlessly if Sentry.init was never called.
 */
export function beginCheckIn(monitorSlug: string): CheckIn {
  const checkInId = Sentry.captureCheckIn({
    monitorSlug,
    status: 'in_progress'
  });

  return {
    ok: () => Sentry.captureCheckIn({ checkInId, monitorSlug, status: 'ok' }),
    error: () =>
      Sentry.captureCheckIn({ checkInId, monitorSlug, status: 'error' })
  };
}
