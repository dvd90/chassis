# Deployment

## Build once, run anywhere

```bash
npm run build     # TypeScript → dist/ (tests excluded)
npm start         # node dist/server.js
```

The compiled output has no build-time dependencies — a production
install (`npm ci --omit=dev`) plus `dist/` is a complete deployment.

## Docker

The included `Dockerfile` is production-shaped out of the box:

- **Multi-stage** — dev dependencies never reach the final image
- **Non-root** — runs as the `node` user
- **`npm ci`** — reproducible installs from the lockfile

```bash
docker build -t my-api .
docker run -p 8000:8000 --env-file .env my-api
```

### docker-compose (local prod-like stack)

```bash
docker compose up --build
```

Starts the API plus MongoDB (if you kept the Mongo module), wired
together — the compose file sets `MONGODB_URI` to the internal hostname.

## Health probes

Chassis exposes the two endpoints orchestrators expect:

| Endpoint       | Meaning                                                              | Use as          |
| -------------- | -------------------------------------------------------------------- | --------------- |
| `GET /healthz` | Process is up                                                        | Liveness probe  |
| `GET /readyz`  | Enabled integrations are ready (e.g. Mongo connected); 503 otherwise | Readiness probe |

Kubernetes example:

```yaml
livenessProbe:
  httpGet: { path: /healthz, port: 8000 }
readinessProbe:
  httpGet: { path: /readyz, port: 8000 }
```

## Graceful shutdown

On `SIGTERM`/`SIGINT` the server stops accepting connections, drains
in-flight requests, disconnects integrations, then exits (with a 10s
force-exit failsafe). This is exactly what rolling deploys on
Kubernetes, ECS, Fly, Railway, Render, etc. need — no special handling
required on your side.

## PaaS notes

Any platform that runs a Node server or a Dockerfile works:

- **Build command:** `npm run build` · **Start command:** `npm start`
  (or just point the platform at the Dockerfile)
- Set `PORT` if the platform injects its own (Chassis reads it)
- Set `NODE_ENV=production`

## Production checklist

- [ ] `NODE_ENV=production` — enables JSON logs, hides stack traces from
      responses
- [ ] `CORS_ORIGINS=https://your-frontend.com` — unset means _allow all_,
      which you want in dev but not in prod
- [ ] Secrets (`MONGODB_URI`, `SENTRY_DSN`, …) come from the platform's
      secret store, not a committed file — `.env` is gitignored, keep it
      that way
- [ ] `SENTRY_DSN` set if you want error reporting (recommended)
- [ ] Point probes at `/healthz` and `/readyz`
- [ ] CI is green (`npm run verify` — the included GitHub Actions
      workflow runs it on Node 20 and 22)
