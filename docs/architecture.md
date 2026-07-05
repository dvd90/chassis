# Architecture

Chassis is deliberately small: the "framework" is ~7 files in `src/core`
that you can read in one sitting. This page explains how a request flows
through it and why the pieces are shaped the way they are.

## Request lifecycle

```
request
  │
  ├─ helmet, cors                      security headers, CORS policy
  ├─ callIdMiddleware                  req.callId = x-call-id header or new UUID
  ├─ ResponseHandler.middleware        req.resHandler = per-request response helper
  ├─ express.json()                    body parsing (after resHandler, so parse
  │                                    errors still get structured responses)
  ├─ requestLogger                     dev only: method/path/status/duration
  │
  ├─ controller route                  your @route handler
  │     └─ throws? Express 5 forwards rejected promises automatically
  │
  ├─ 404 handler                       structured JSON for unmatched routes
  └─ central error handler             AppError → mapped status
                                       401/403 → wrongToken
                                       400 → badRequest
                                       anything else → 500 (+ Sentry if enabled)
```

## The decorator flow

1. **Class definition time** — `@route('get', '/:id')` runs and pushes a
   `RouteDefinition` (method, path, handler name, middlewares) onto a
   symbol-keyed array on the controller's prototype. No router exists yet.
2. **Boot time** — `createApp()` iterates every class exported from
   `src/controllers`, instantiates it, and calls `registerToRouter(app)`.
   That builds a fresh `express.Router`, binds each handler to the
   instance, and mounts it at the controller's base path.

Because decorators only record metadata, ordering problems disappear:
`@protectedRoute` can be evaluated long before the auth integration
initializes — `requireAuth()` resolves the provider per request.

## Errors

Two intentional paths:

- **Expected failures** — return them: `req.resHandler.notFound('...')`,
  or throw `new AppError(ERROR_CODES.CONFLICT, '...')` from anywhere
  (controller, service, model hook). The central handler maps it.
- **Unexpected failures** — just let them throw. Express 5 catches
  rejected promises; the central handler logs the stack (with `callId`),
  reports to Sentry when enabled, and returns a sanitized 500 (stack
  traces are only included outside production).

## Why an app factory?

`createApp()` performs no I/O — integrations boot separately in
`server.ts`. Tests build the app synchronously and hit it with supertest;
no port, no database, no mocks of the framework itself. The
`extraRoutables` option lets tests (or plugins) mount throwaway
controllers to exercise any code path — see `src/__tests__/app.test.ts`.

## Configuration

`src/config` is the only file that touches `process.env`. The zod schema
validates at import time and the process exits with a readable message on
bad config. Feature flags (`config.features.*`) are derived from which
variables are present — that's the entire opt-in mechanism.
