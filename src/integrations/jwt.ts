import { NextFunction, Request, Response } from 'express';
import { jwtVerify } from 'jose';
import { setAuthProvider } from '../core/auth';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Enabled when JWT_SECRET is set. Verifies a `Bearer <token>` (HS256).
 * Issuing tokens is app-specific — sign them with the same secret via
 * jose's SignJWT (see docs/guides/authentication.md). Read the verified
 * claims in a handler with `jwtVerify(token, secret)` if you need them.
 */
export function initJwt(): void {
  const secret = new TextEncoder().encode(config.jwt.secret);

  setAuthProvider([
    async (req: Request, _res: Response, next: NextFunction) => {
      const header = req.headers.authorization;
      const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
      if (!token) return req.resHandler.wrongToken('Missing bearer token');

      try {
        await jwtVerify(token, secret);
        next();
      } catch {
        return req.resHandler.wrongToken('Invalid or expired token');
      }
    }
  ]);

  logger.info('✅ Local JWT authentication enabled');
}
