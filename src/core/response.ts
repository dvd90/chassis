import { NextFunction, Request, Response } from 'express';
import { ERROR_CODES, ErrorCode } from './errors';
import { logger } from '../utils/logger';
import { config } from '../config';

export interface ValidationIssue {
  part: 'body' | 'query' | 'params';
  path: string;
  message: string;
}

/**
 * A per-request helper attached as `req.resHandler`. It gives every
 * endpoint a consistent response vocabulary (`ok`, `notFound`, ...) and
 * logs structured metadata — including the request's `callId` — for
 * every response it sends.
 */
export class ResponseHandler {
  constructor(
    private readonly req: Request,
    private readonly res: Response
  ) {}

  static middleware(req: Request, _res: Response, next: NextFunction): void {
    req.resHandler = new ResponseHandler(req, _res);
    next();
  }

  ok(data?: unknown): Response {
    this.logMeta(ERROR_CODES.OK);
    return this.res.status(200).json(data ?? { success: true });
  }

  created(data?: unknown): Response {
    this.logMeta(ERROR_CODES.CREATED);
    return this.res.status(201).json(data ?? { success: true });
  }

  noContent(): Response {
    this.logMeta(ERROR_CODES.NO_CONTENT);
    return this.res.status(204).send();
  }

  badRequest(message?: string): Response {
    return this.sendError(ERROR_CODES.BAD_REQUEST, { message });
  }

  validation(issues: ValidationIssue[]): Response {
    return this.sendError(ERROR_CODES.VALIDATION, { issues });
  }

  wrongToken(message?: string): Response {
    return this.sendError(ERROR_CODES.WRONG_TOKEN, { message });
  }

  forbidden(message?: string): Response {
    return this.sendError(ERROR_CODES.FORBIDDEN, { message });
  }

  notFound(message?: string): Response {
    return this.sendError(ERROR_CODES.NOT_FOUND, { message });
  }

  conflict(message?: string): Response {
    return this.sendError(ERROR_CODES.CONFLICT, { message });
  }

  notImplemented(message?: string): Response {
    return this.sendError(ERROR_CODES.NOT_IMPLEMENTED, { message });
  }

  serviceUnavailable(data?: Record<string, unknown>): Response {
    return this.sendError(ERROR_CODES.SERVICE_UNAVAILABLE, data);
  }

  /** Send any ErrorCode with optional extra payload. */
  manualError(code: ErrorCode, data?: Record<string, unknown>): Response {
    return this.sendError(code, data);
  }

  /** Unexpected errors — logs the stack, hides it from clients in prod. */
  error(err: Error): Response {
    const code = ERROR_CODES.SERVER_ERROR;
    this.logMeta(code, { errorMessage: err.message, stack: err.stack });

    return this.res.status(code.statusCode).json({
      statusCode: code.statusCode,
      statusReason: code.statusReason,
      errorId: code.id,
      message:
        config.env === 'production' ? 'Something went wrong' : err.message,
      ...(config.env !== 'production' && { stack: err.stack }),
      callId: this.req.callId
    });
  }

  private sendError(code: ErrorCode, data?: Record<string, unknown>): Response {
    this.logMeta(code, data);

    return this.res.status(code.statusCode).json({
      statusCode: code.statusCode,
      statusReason: code.statusReason,
      errorId: code.id,
      callId: this.req.callId,
      ...data
    });
  }

  private logMeta(code: ErrorCode, extra?: Record<string, unknown>): void {
    const meta = {
      status: code.statusCode,
      errorId: code.id,
      callId: this.req.callId,
      method: this.req.method,
      endpoint: this.req.originalUrl,
      ...extra
    };

    if (code.statusCode < 400) logger.info(code.statusReason, meta);
    else logger.error(code.statusReason, meta);
  }
}
