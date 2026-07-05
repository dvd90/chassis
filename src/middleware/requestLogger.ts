import { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger';

/** Lightweight request logging (dev only — mounted in app.ts). */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    logger.info(
      `${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms`,
      { callId: req.callId }
    );
  });

  next();
}
