import { RequestHandler } from 'express';
import { addRouteDefinition, ExpressRoute, HTTPMethod } from './routable';
import { requireAuth } from './auth';

/**
 * Declare a public endpoint on a Routable controller:
 *
 *   @route('get', '/:id')
 *   async show(req: Request) { ... }
 *
 * Express 5 catches rejected promises automatically, so thrown errors
 * (including AppError) land in the central error handler — no wrapper
 * decorator needed.
 */
export function route(
  method: HTTPMethod,
  path: string,
  middlewares: RequestHandler[] = []
) {
  return <T extends ExpressRoute>(
    target: object,
    propertyName: string,
    _descriptor: TypedPropertyDescriptor<T>
  ): void => {
    addRouteDefinition(target, {
      method,
      path,
      handlerName: propertyName,
      middlewares
    });
  };
}

/**
 * Same as @route, but the request must pass the configured auth provider
 * first (see `src/core/auth.ts`). Responds 501 if no provider is set up.
 */
export function protectedRoute(
  method: HTTPMethod,
  path: string,
  middlewares: RequestHandler[] = []
) {
  return route(method, path, [requireAuth(), ...middlewares]);
}
