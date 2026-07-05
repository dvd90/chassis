import { Application, NextFunction, Request, Response } from 'express';
import { AppError } from './errors';
import { config } from '../config'; // chassis:sentry
import { captureException } from '../integrations/sentry'; // chassis:sentry

/**
 * Mounted last: a JSON 404 for unmatched routes and the central error
 * handler. Express 5 forwards rejected promises from handlers here
 * automatically.
 */
export function registerErrorHandlers(app: Application): void {
  app.use((req: Request, _res: Response) => {
    req.resHandler.notFound(`Cannot ${req.method} ${req.originalUrl}`);
  });

  app.use((err: unknown, req: Request, _res: Response, _next: NextFunction) => {
    if (config.features.sentry) captureException(err); // chassis:sentry

    if (err instanceof AppError) {
      req.resHandler.manualError(err.code, {
        message: err.message,
        ...(err.details !== undefined && { details: err.details })
      });
      return;
    }

    const { status, statusCode } = err as {
      status?: number;
      statusCode?: number;
    };
    const httpStatus = status ?? statusCode;
    const message = err instanceof Error ? err.message : String(err);

    // Body-parser JSON syntax errors and similar client faults.
    if (httpStatus === 400) {
      req.resHandler.badRequest(message);
      return;
    }

    // Auth middleware failures (e.g. express-oauth2-jwt-bearer).
    if (httpStatus === 401 || httpStatus === 403) {
      req.resHandler.wrongToken(message);
      return;
    }

    req.resHandler.error(err instanceof Error ? err : new Error(message));
  });
}
