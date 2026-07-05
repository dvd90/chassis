import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config';
import { registerErrorHandlers, ResponseHandler, Routable } from './core';
import { callIdMiddleware, requestLogger } from './middleware';
import * as controllers from './controllers';

export interface CreateAppOptions {
  /** Extra Routable instances to mount (handy for tests and plugins). */
  extraRoutables?: Routable[];
}

/**
 * Pure app factory: no I/O, no side effects — integrations are booted
 * separately in server.ts, which keeps this trivially testable.
 */
export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins ?? true }));
  // callId + resHandler come before the body parser so even parse
  // errors get a structured, correlated response.
  app.use(callIdMiddleware);
  app.use(ResponseHandler.middleware);
  app.use(express.json());

  if (config.env === 'development') {
    app.use(requestLogger);
  }

  app.get('/', (_req, res) => {
    res.json({ name: 'chassis', status: 'running 🏎️' });
  });

  // Auto-mount every controller exported from src/controllers.
  for (const Controller of Object.values(controllers)) {
    new (Controller as new () => Routable)().registerToRouter(app);
  }

  for (const routable of options.extraRoutables ?? []) {
    routable.registerToRouter(app);
  }

  registerErrorHandlers(app);

  return app;
}
