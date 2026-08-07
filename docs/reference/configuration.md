# Configuration reference

All configuration is environment variables, declared and validated with
zod in `src/config/index.ts` — the **only** file that reads
`process.env`. On invalid config the process prints each problem and
exits before binding a port.

`.env` files are loaded automatically in development (via `dotenv`);
in production, inject real environment variables instead.

## Variables

| Variable            | Type / default                                                  | Purpose                                                                                  |
| ------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `NODE_ENV`          | `development` \| `test` \| `production` — default `development` | Log format (pretty vs JSON), stack-trace exposure, dev request logging                   |
| `PORT`              | positive integer — default `8000`                               | HTTP port                                                                                |
| `CORS_ORIGINS`      | comma-separated list — default _(empty = allow all)_            | Allowed CORS origins, e.g. `https://app.example.com,https://admin.example.com`           |
| `MONGODB_URI`       | string — optional                                               | **Enables the Mongo module.** Standard connection string                                 |
| `DATABASE_URL`      | string — optional                                               | **Enables the Postgres module** (Drizzle). Postgres connection string                    |
| `SQLITE_PATH`       | string — optional                                               | **Enables the SQLite module** (Drizzle). File path, or `:memory:`                        |
| `AUTH0_DOMAIN`      | string — optional                                               | **Enables Auth0** (with `AUTH0_AUDIENCE`). Tenant domain, e.g. `my-tenant.eu.auth0.com`  |
| `AUTH0_AUDIENCE`    | string — optional                                               | **Enables Auth0** (with `AUTH0_DOMAIN`). The API identifier from the Auth0 dashboard     |
| `JWT_SECRET`        | string — optional                                               | **Enables local auth.** Signs access tokens and verifies Bearer tokens                   |
| `SESSION_IDLE`      | duration — default `30d`                                        | Sliding refresh-token lifetime — see [Sessions](../guides/sessions.md)                   |
| `SESSION_ABSOLUTE`  | duration — default `90d`                                        | Hard cap on a session's age, measured from sign-in and never renewed                     |
| `AUTH_DEV_EMAIL`    | string — optional                                               | Seeds one identity in the in-memory store (only used when no database is configured)     |
| `CLERK_SECRET_KEY`  | string — optional                                               | **Enables Clerk auth.** Clerk secret key                                                 |
| `SENTRY_DSN`        | string — optional                                               | **Enables Sentry** error reporting                                                       |
| `X402_PAY_TO`       | string — optional                                               | **Enables x402 payments** for `@paidRoute`. Wallet address receiving payments            |
| `X402_NETWORK`      | string — default `base-sepolia`                                 | x402 network (`base-sepolia` testnet, `base` mainnet)                                    |
| `MCP_API_URL`       | string — default `http://localhost:8000`                        | API base URL the `npm run mcp` server calls into                                         |

## Feature flags

`config.features` is derived from which variables are present — this is
the entire opt-in mechanism:

```ts
features: {
  mongo:    Boolean(env.MONGODB_URI),
  postgres: Boolean(env.DATABASE_URL),
  sqlite:   Boolean(env.SQLITE_PATH),
  auth0:    Boolean(env.AUTH0_DOMAIN && env.AUTH0_AUDIENCE),
  session:  Boolean(env.JWT_SECRET),
  clerk:    Boolean(env.CLERK_SECRET_KEY),
  sentry:   Boolean(env.SENTRY_DSN),
  x402:     Boolean(env.X402_PAY_TO)
}
```

`src/integrations/index.ts` initializes each integration only when its
flag is true; `/readyz` checks only enabled integrations.

## Adding a variable

1. Add it to the zod schema in `src/config/index.ts`:

   ```ts
   REDIS_URL: z.string().optional();
   ```

2. Expose it (and a feature flag if it gates an integration) on the
   exported `config` object.
3. Document it in `.env.example`.

Never read `process.env` elsewhere — the single-schema rule is what
makes misconfiguration fail loudly at boot instead of quietly at 3am.
