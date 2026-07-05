import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

/**
 * Attaches a correlation id to every request. Incoming `x-call-id`
 * headers are propagated (useful behind gateways / between services);
 * otherwise a UUID is generated. The id is echoed back in the response
 * and included in every log line via ResponseHandler.
 */
export function callIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  req.callId = req.header('x-call-id') ?? randomUUID();
  res.setHeader('x-call-id', req.callId);
  next();
}
