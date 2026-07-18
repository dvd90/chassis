import { Request, Response } from 'express';
import { Routable, route } from '../core';
import { config } from '../config'; // chassis:mongo
import { isMongoReady } from '../integrations/mongo'; // chassis:mongo
import { config as pgConfig } from '../config'; // chassis:postgres
import { isPostgresReady } from '../integrations/postgres'; // chassis:postgres
import { config as sqliteConfig } from '../config'; // chassis:sqlite
import { isSqliteReady } from '../integrations/sqlite'; // chassis:sqlite

export class HealthController extends Routable {
  constructor() {
    super('/');
  }

  /**
   * @desc   Liveness probe — is the process running?
   * @access Public
   */
  @route('get', '/healthz')
  async live(req: Request): Promise<Response> {
    return req.resHandler.ok({ status: 'alive' });
  }

  /**
   * @desc   Readiness probe — are enabled integrations ready for traffic?
   * @access Public
   */
  @route('get', '/readyz')
  async ready(req: Request): Promise<Response> {
    const checks: Record<string, boolean> = {};

    if (config.features.mongo) checks.mongo = isMongoReady(); // chassis:mongo
    if (pgConfig.features.postgres) checks.postgres = await isPostgresReady(); // chassis:postgres
    if (sqliteConfig.features.sqlite) checks.sqlite = isSqliteReady(); // chassis:sqlite

    const ready = Object.values(checks).every(Boolean);

    return ready
      ? req.resHandler.ok({ status: 'ready', checks })
      : req.resHandler.serviceUnavailable({ status: 'not ready', checks });
  }
}
