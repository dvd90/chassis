export interface ErrorCode {
  /** Stable application-level identifier, safe to key on from clients. */
  id: number;
  statusCode: number;
  statusReason: string;
}

export const ERROR_CODES = {
  OK: { id: 0, statusCode: 200, statusReason: 'OK' },
  CREATED: { id: 0, statusCode: 201, statusReason: 'Created' },
  NO_CONTENT: { id: 0, statusCode: 204, statusReason: 'No Content' },
  BAD_REQUEST: { id: 1000, statusCode: 400, statusReason: 'Bad Request' },
  VALIDATION: { id: 1001, statusCode: 400, statusReason: 'Validation Failed' },
  WRONG_TOKEN: {
    id: 1002,
    statusCode: 401,
    statusReason: 'Invalid or Missing Token'
  },
  FORBIDDEN: { id: 1003, statusCode: 403, statusReason: 'Forbidden' },
  NOT_FOUND: { id: 1004, statusCode: 404, statusReason: 'Not Found' },
  CONFLICT: { id: 1005, statusCode: 409, statusReason: 'Conflict' },
  SERVER_ERROR: {
    id: 1500,
    statusCode: 500,
    statusReason: 'Internal Server Error'
  },
  NOT_IMPLEMENTED: {
    id: 1501,
    statusCode: 501,
    statusReason: 'Not Implemented'
  },
  SERVICE_UNAVAILABLE: {
    id: 1503,
    statusCode: 503,
    statusReason: 'Service Unavailable'
  }
} as const satisfies Record<string, ErrorCode>;

/**
 * Throw this anywhere in a controller or service to produce a clean,
 * correctly-mapped HTTP error response — the central error handler
 * takes care of the rest.
 *
 *   throw new AppError(ERROR_CODES.NOT_FOUND, `User ${id} not found`);
 */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message?: string,
    public readonly details?: unknown
  ) {
    super(message ?? code.statusReason);
    this.name = 'AppError';
  }
}
