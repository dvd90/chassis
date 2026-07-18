# Integrations & modules

Every integration in Chassis follows the same contract, which is what
makes the template safe to strip down (the `create-chassis` CLI does
exactly that) and easy to extend.

## The contract

An integration is:

1. **One file** in `src/integrations/<name>.ts` exporting `init<Name>()`
   (plus optional `close<Name>()` / readiness helpers).
2. **One feature flag** in `src/config` derived from its env vars:
   `features.<name> = Boolean(env.SOME_VAR)`.
3. **Single-line hooks** where it touches shared code — registration in
   `src/integrations/index.ts`, optional lines in the health controller,
   error handler, `.env.example`, and `docker-compose.yml`.

Nothing else in the codebase may import an integration directly
(the health controller's readiness check is the one sanctioned
exception).

## Built-in integrations

| Module     | Env vars                          | Hooks                                                                  |
| ---------- | --------------------------------- | ---------------------------------------------------------------------- |
| `mongo`    | `MONGODB_URI`                     | connect at boot, `/readyz` check, graceful disconnect, compose service |
| `postgres` | `DATABASE_URL`                    | Drizzle client, `/readyz` ping, graceful close, compose service        |
| `sqlite`   | `SQLITE_PATH`                     | Drizzle + better-sqlite3, `/readyz` ping, graceful close               |
| `auth0`    | `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`  | registers the auth provider used by `@protectedRoute`                  |
| `jwt`      | `JWT_SECRET`                      | registers a jose Bearer-token provider for `@protectedRoute`           |
| `clerk`    | `CLERK_SECRET_KEY`                | registers Clerk's middleware as the `@protectedRoute` provider         |
| `sentry`   | `SENTRY_DSN`                      | `Sentry.init` at boot, `captureException` in the error handler         |
| `x402`     | `X402_PAY_TO`                     | registers the payment gate used by `@paidRoute`                        |
| `mcp`      | _(none — separate stdio process)_ | `npm run mcp` server exposing the API as agent tools                   |

## Choice groups

Two concerns are **pick-exactly-one** groups rather than independent toggles,
because their options are mutually exclusive:

- **Database** — `none` / `mongo` / `postgres` / `sqlite`. The ORM follows the
  choice (Mongoose or Drizzle). See [Database](guides/database.md).
- **Auth** — `none` / `auth0` / `jwt` / `clerk`, all sharing the
  `setAuthProvider()` seam. See [Authentication](guides/authentication.md).

Mechanically a group variant is just a module in the `chassis:<name>`
namespace: choosing Postgres declines `mongo` and `sqlite`, which prune
exactly like a declined toggle. The template ships every variant installed
together; the CLI keeps only the one you pick.

`@protectedRoute` (auth) and `@paidRoute` (x402) live in `src/core` and are
always present — with no provider configured they answer `501`, never open.

## The `chassis:<name>` markers

Lines that exist only for a specific integration carry a trailing
`// chassis:<name>` (or `# chassis:<name>`) marker:

```ts
import { initMongo, closeMongo } from './mongo'; // chassis:mongo
```

The `create-chassis` CLI uses these markers to prune declined modules:
it deletes the module's file, drops every marked line, and removes the
dependency from `package.json` — leaving a project that compiles and
tests green as if the module never existed.

**Rule of thumb:** keep every marked construct on a single line.

## Adding your own integration

1. Create `src/integrations/redis.ts` with `initRedis()` /
   `closeRedis()`.
2. Add `REDIS_URL` to the schema in `src/config` and
   `features.redis: Boolean(env.REDIS_URL)`.
3. Register it in `src/integrations/index.ts`:
   `if (config.features.redis) await initRedis();`
4. Optionally add a `/readyz` check and an `.env.example` entry.

Swap rather than add: to replace Auth0 with any other IdP, call
`setAuthProvider([...yourMiddleware])` from your own integration —
`@protectedRoute` doesn't know or care who verifies the token.
