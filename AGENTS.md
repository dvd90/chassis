# Agent guide

Instructions for AI coding agents (Claude Code, Cursor, Copilot, Codex, …)
working in a Chassis project. Follow these conventions and the code you
produce will match what a human maintainer would write — that's the whole
point of this file.

**Golden rule:** finish every change by running `npm run verify` and only
stop when it passes. It runs typecheck + lint + tests — the same gate CI
uses. Green means done; anything else means keep going.

## The 60-second mental model

- **Endpoints are controller methods.** A controller is a class extending
  `Routable`; each method is decorated with `@route(method, path)`.
- **Exported controllers auto-mount.** Everything exported from
  `src/controllers/index.ts` is registered at boot. There are no router
  files to edit.
- **Responses go through `req.resHandler`** — `ok`, `created`, `notFound`,
  `validation`, … Never call `res.status().json()` directly.
- **Errors are thrown, not handled.** `throw new AppError(ERROR_CODES.X, msg)`
  from anywhere; a central handler maps it. Do not write try/catch in
  controllers — Express 5 forwards rejected promises for you.
- **Config is one validated file.** `src/config` is the only place that
  reads `process.env`.

## Do this

- **Add an endpoint:** run `npm run gen <Name>` to scaffold a controller +
  test, then edit the generated methods. It's DB-aware — it wires the
  controller to the installed ORM (Drizzle or Mongoose) and, for Drizzle,
  appends a table to `src/db/<engine>/schema.ts`. (Or copy an existing
  `*.controller.ts` and export it from `src/controllers/index.ts`.)
- **Protect or charge for a route** with `@protectedRoute(...)` (auth) or
  `@paidRoute(method, path, price)` (x402 payments). Both answer `501` until
  their module is configured — never silently open or free.
- **Validate input** with `validate({ body|query|params: zodSchema })` in
  the route's middleware array. Define the schema next to the controller
  or in `src/schemas`.
- **Return via `req.resHandler`** and match the semantic helper to the
  outcome (`created` for 201, `noContent` for 204, `notFound`, `conflict`,
  …). See `docs/reference/core-api.md` for the full list.
- **Signal errors** by throwing `AppError` with the right `ERROR_CODES`
  entry. Add new domain codes to `src/core/errors.ts` rather than
  inventing ad-hoc status numbers.
- **Add a config value** by extending the zod schema in `src/config`,
  exposing it on the `config` object, and documenting it in `.env.example`.
- **Keep controllers thin.** Push real logic into `src/services/*` and
  data access into `src/models/*`. Controllers translate HTTP ↔ domain.

## Don't do this

- ❌ Don't call `res.status(...).json(...)` — use `req.resHandler`.
- ❌ Don't wrap controller bodies in try/catch — throw `AppError` instead.
- ❌ Don't read `process.env` outside `src/config`.
- ❌ Don't hand-write route registration or `express.Router()` — the
  decorators and the app factory do it.
- ❌ Don't edit `src/core/**` to build a feature. That's the framework;
  features live in controllers, services, models, schemas, integrations.
- ❌ Don't add a dependency when a listed one already covers it (zod for
  validation, winston for logging, your installed ORM — Drizzle or Mongoose —
  for data access).
- ❌ Don't disable lint rules or loosen `tsconfig` to make `verify` pass —
  fix the actual issue.

## Where things live

| Need to…                     | Go to                                        |
| ---------------------------- | -------------------------------------------- |
| Add/change an endpoint       | `src/controllers/*.controller.ts`            |
| Validate request input       | `validate({...})` + a zod schema             |
| Business logic               | `src/services/*` (create if absent)          |
| Database models              | `src/models/*` (create if absent)            |
| Add an env var / config      | `src/config/index.ts` + `.env.example`       |
| Add an error type            | `src/core/errors.ts` (`ERROR_CODES`)         |
| Add an optional integration  | `src/integrations/*` — see `docs/modules.md` |
| Framework internals (rarely) | `src/core/*`                                 |

## Reference

Deeper docs live in `docs/` (`docs/README.md` is the index). The most
useful for agents:

- `docs/reference/core-api.md` — every decorator, `resHandler` method,
  `AppError`, `validate()`
- `docs/guides/building-an-api.md` — a full worked CRUD resource
- `docs/architecture.md` — request lifecycle and why the pieces fit

## Definition of done

1. Feature works (add or update a test proving it).
2. `npm run verify` passes — typecheck, lint, and tests all green.
3. No new `process.env` reads, no `res.status().json()`, no try/catch in
   controllers, no edits to `src/core` for feature work.
