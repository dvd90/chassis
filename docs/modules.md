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

| Module   | Env vars                         | Hooks                                                                  |
| -------- | -------------------------------- | ---------------------------------------------------------------------- |
| `mongo`  | `MONGODB_URI`                    | connect at boot, `/readyz` check, graceful disconnect, compose service |
| `auth0`  | `AUTH0_DOMAIN`, `AUTH0_AUDIENCE` | registers the auth provider used by `@protectedRoute`                  |
| `sentry` | `SENTRY_DSN`                     | `Sentry.init` at boot, `captureException` in the error handler         |

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
