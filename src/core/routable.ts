import express, {
  Application,
  RequestHandler,
  Request,
  Response
} from 'express';

export type HTTPMethod =
  'get' | 'post' | 'put' | 'patch' | 'delete' | 'options' | 'head';

export type ExpressRoute = (
  req: Request,
  res: Response
) => unknown | Promise<unknown>;

export interface RouteDefinition {
  method: HTTPMethod;
  path: string;
  handlerName: string;
  middlewares: RequestHandler[];
}

const ROUTES: unique symbol = Symbol('chassis:routes');

interface RoutablePrototype {
  [ROUTES]?: RouteDefinition[];
}

/** Called by the @route decorator at class-definition time. */
export function addRouteDefinition(
  prototype: object,
  definition: RouteDefinition
): void {
  const proto = prototype as RoutablePrototype;
  (proto[ROUTES] ??= []).push(definition);
}

/**
 * Base class for controllers. Extend it, decorate methods with @route /
 * @protectedRoute, export the class from `src/controllers/index.ts` — and
 * the app auto-mounts it. See `src/controllers/Status.controller.ts`.
 */
export abstract class Routable {
  constructor(protected readonly basePath: string = '/') {}

  registerToRouter(app: Application, basePath?: string): void {
    const router = express.Router();
    const proto = Object.getPrototypeOf(this) as RoutablePrototype;

    for (const def of proto[ROUTES] ?? []) {
      const self = this as unknown as Record<string, ExpressRoute>;
      const handler = self[def.handlerName].bind(this);
      router[def.method](def.path, ...def.middlewares, handler);
    }

    app.use(basePath ?? this.basePath, router);
  }
}
