import { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Pluggable auth: integrations (e.g. Auth0) register a middleware chain
 * here at boot. `@protectedRoute` uses `requireAuth()`, which resolves the
 * provider at request time — so route decorators can run before any
 * integration has initialized.
 */
let provider: RequestHandler[] | undefined;

export function setAuthProvider(middlewares: RequestHandler[]): void {
  provider = middlewares;
}

export function requireAuth(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const chain = provider;

    if (!chain || chain.length === 0) {
      return req.resHandler.notImplemented(
        'This route is protected but no auth provider is configured. ' +
          'Set the auth environment variables (see .env.example) or register ' +
          'your own provider with setAuthProvider().'
      );
    }

    let index = 0;
    const run = (err?: unknown): void => {
      if (err) return next(err);
      const middleware = chain[index++];
      if (!middleware) return next();
      middleware(req, res, run);
    };

    run();
  };
}
