# Core API reference

Everything below is exported from `src/core` (`import { ... } from '../core'`).

## `Routable`

Base class for controllers.

```ts
class UserController extends Routable {
  constructor() {
    super('/users'); // base path (default '/')
  }
}
```

- `registerToRouter(app, basePath?)` — builds an `express.Router` from
  the class's decorated methods and mounts it. Called for you by the app
  factory for every class exported from `src/controllers/index.ts`.

## `@route(method, path, middlewares?)`

Declares an endpoint on a `Routable` method.

```ts
@route('get', '/:id')
async show(req: Request): Promise<Response> { ... }

@route('post', '/', [validate({ body: schema }), rateLimiter])
async create(req: Request): Promise<Response> { ... }
```

- `method`: `'get' | 'post' | 'put' | 'patch' | 'delete' | 'options' | 'head'`
- `path`: Express path, relative to the controller's base path
- `middlewares`: optional `RequestHandler[]`, run before the handler
- Handlers may throw — Express 5 forwards rejected promises to the
  central error handler.

## `@protectedRoute(method, path, middlewares?)`

Like `@route`, but the configured auth provider runs first; your
`middlewares` run after it. Answers **501** when no provider is
configured. See [Authentication](../guides/authentication.md).

## `req.resHandler` (`ResponseHandler`)

Attached to every request. Every method logs structured metadata
(status, method, endpoint, `callId`) and returns the Express `Response`.

**Success:**

| Method           | Status |
| ---------------- | ------ |
| `ok(data?)`      | 200    |
| `created(data?)` | 201    |
| `noContent()`    | 204    |

**Failure** — all respond with a consistent envelope
`{ statusCode, statusReason, errorId, callId, ...extra }`:

| Method                      | Status                                                  |
| --------------------------- | ------------------------------------------------------- |
| `badRequest(message?)`      | 400                                                     |
| `validation(issues)`        | 400                                                     |
| `wrongToken(message?)`      | 401                                                     |
| `forbidden(message?)`       | 403                                                     |
| `notFound(message?)`        | 404                                                     |
| `conflict(message?)`        | 409                                                     |
| `error(err)`                | 500 — sanitized in production, stack included otherwise |
| `notImplemented(message?)`  | 501                                                     |
| `serviceUnavailable(data?)` | 503                                                     |
| `manualError(code, data?)`  | any `ErrorCode`                                         |

## `AppError` and `ERROR_CODES`

Throw from anywhere (controller, service, model hook); the central
error handler maps it:

```ts
throw new AppError(ERROR_CODES.CONFLICT, 'Email already registered');
throw new AppError(ERROR_CODES.FORBIDDEN, 'Owners only', { userId });
```

- `new AppError(code, message?, details?)` — `details` is included in
  the response body when provided.
- `ERROR_CODES` entries carry `{ id, statusCode, statusReason }`; `id`
  is a stable application-level code clients can switch on. Add your own
  domain codes to `src/core/errors.ts`.

## `validate(schemas)`

Zod validation middleware for `body`, `query`, and `params`:

```ts
@route('post', '/', [validate({ body: createUserSchema, query: pageSchema })])
```

- On failure: 400 with `issues: [{ part, path, message }]`.
- On success: the parsed/transformed result **replaces `req.body`**
  (query/params are read-only getters in Express 5 and are validated
  in place).

## `setAuthProvider(middlewares)` / `requireAuth()`

The pluggable-auth seam. Integrations call `setAuthProvider([...])` at
boot; `@protectedRoute` runs the registered chain per request via
`requireAuth()`. See `src/core/auth.ts`.

## Request extensions

Declared in `src/types/express.d.ts`, available on every `Request`:

| Property         | Type              | Source                                                                             |
| ---------------- | ----------------- | ---------------------------------------------------------------------------------- |
| `req.callId`     | `string`          | `x-call-id` header or a generated UUID; echoed in the response header and all logs |
| `req.resHandler` | `ResponseHandler` | attached by middleware before any route runs                                       |

## `createApp(options?)`

The pure app factory (`src/app.ts`). No I/O — integrations boot
separately in `server.ts`.

```ts
const app = createApp({ extraRoutables: [new FakeController()] });
```

- `extraRoutables` — extra `Routable` instances mounted after the
  auto-registered controllers and before the error handlers. Built for
  tests; see `src/__tests__/app.test.ts`.
