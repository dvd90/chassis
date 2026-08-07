import { NextFunction, Request, Response } from 'express';
import { setAuthProvider } from '../core/auth';
import { config } from '../config';
import { now } from '../utils/clock';
import { logger } from '../utils/logger';

// ponytail: jose ships ESM only, so a CJS build can't statically import it.
// Hoisted here so the module loads once, not per request. Back to a top-level
// import the day this package goes "type": "module".
const jose = import('jose');

/**
 * Enabled when JWT_SECRET is set. Verifies a `Bearer <token>` (HS256) and
 * attaches the verified subject as `req.identityId`, which is what
 * `/auth/revoke-all` and any handler needing "who is this" reads.
 *
 * Tokens are minted by src/services/session.ts with the same secret.
 */
export function initJwt(): void {
  const secret = new TextEncoder().encode(config.jwt.secret);

  setAuthProvider([
    async (req: Request, _res: Response, next: NextFunction) => {
      const header = req.headers.authorization;
      const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
      if (!token) return req.resHandler.wrongToken('Missing bearer token');

      try {
        const { jwtVerify } = await jose;
        const { payload } = await jwtVerify(token, secret, {
          // Pin the algorithm: without this, jose would accept any algorithm
          // the token's own header asks for.
          algorithms: ['HS256'],
          // Expiry is decided by the injected clock, so tests can age a token
          // without touching the system clock.
          currentDate: now()
        });

        req.identityId = payload.sub;
        next();
      } catch {
        return req.resHandler.wrongToken('Invalid or expired token');
      }
    }
  ]);

  logger.info('✅ Local authentication enabled');
}
