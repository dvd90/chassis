import type { ResponseHandler } from '../core/response';

declare global {
  namespace Express {
    interface Request {
      /** Correlation id — generated (or propagated from `x-call-id`) per request. */
      callId: string;
      /** Response helper attached by `ResponseHandler.middleware`. */
      resHandler: ResponseHandler;
      /** Verified `sub` claim, attached by the local-JWT auth provider. */
      identityId?: string;
    }
  }
}

export {};
