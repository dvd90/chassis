# Configuration reference

All configuration is environment variables, declared and validated with
zod in `src/config/index.ts` — the **only** file that reads
`process.env`. On invalid config the process prints each problem and
exits before binding a port.

`.env` files are loaded automatically in development (via `dotenv`);
in production, inject real environment variables instead.

## Variables

| Variable         | Type / default                                                  | Purpose                                                                                 |
| ---------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `NODE_ENV`       | `development` \| `test` \| `production` — default `development` | Log format (pretty vs JSON), stack-trace exposure, dev request logging                  |
| `PORT`           | positive integer — default `8000`                               | HTTP port                                                                               |
| `CORS_ORIGINS`   | comma-separated list — default _(empty = allow all)_            | Allowed CORS origins, e.g. `https://app.example.com,https://admin.example.com`          |
| `MONGODB_URI`    | string — optional                                               | **Enables the Mongo module.** Standard connection string                                |
| `AUTH0_DOMAIN`   | string — optional                                               | **Enables Auth0** (with `AUTH0_AUDIENCE`). Tenant domain, e.g. `my-tenant.eu.auth0.com` |
| `AUTH0_AUDIENCE` | string — optional                                               | **Enables Auth0** (with `AUTH0_DOMAIN`). The API identifier from the Auth0 dashboard    |
| `SENTRY_DSN`     | string — optional                                               | **Enables Sentry** error reporting                                                      |

## Feature flags

`config.features` is derived from which variables are present — this is
the entire opt-in mechanism:

```ts
features: {
  mongo:  Boolean(env.MONGODB_URI),
  auth0:  Boolean(env.AUTH0_DOMAIN && env.AUTH0_AUDIENCE),
  sentry: Boolean(env.SENTRY_DSN)
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
