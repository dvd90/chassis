import { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodType } from 'zod';
import { ValidationIssue } from './response';

interface ValidationSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/**
 * Zod-powered validation middleware for route inputs:
 *
 *   @route('post', '/', [validate({ body: createUserSchema })])
 *   async create(req: Request) { ... }
 *
 * Responds 400 with a structured issue list when validation fails.
 * On success the parsed (and transformed) body replaces `req.body`.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const issues: ValidationIssue[] = [];

    for (const part of ['body', 'query', 'params'] as const) {
      const schema = schemas[part];
      if (!schema) continue;

      const result = schema.safeParse(req[part]);
      if (!result.success) {
        issues.push(
          ...result.error.issues.map((issue) => ({
            part,
            path: issue.path.join('.'),
            message: issue.message
          }))
        );
      } else if (part === 'body') {
        // req.query and req.params are read-only getters in Express 5.
        req.body = result.data;
      }
    }

    if (issues.length > 0) {
      return req.resHandler.validation(issues);
    }

    next();
  };
}
