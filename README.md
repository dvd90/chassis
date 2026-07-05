# 🏎️ Chassis

**A lightweight, decorator-driven Express + TypeScript backend starter. Clone, run, ship.**

Chassis gives you NestJS-style controller ergonomics on plain Express 5 — in a handful of small files you can actually read. Zero configuration required: the server boots standalone, and every integration (MongoDB, Auth0, Sentry) switches on only when you add its environment variable.

```ts
export class UserController extends Routable {
  constructor() {
    super('/users');
  }

  @route('get', '/:id')
  async show(req: Request) {
    const user = await findUser(req.params.id);
    if (!user) throw new AppError(ERROR_CODES.NOT_FOUND, 'User not found');
    return req.resHandler.ok(user);
  }

  @protectedRoute('post', '/', [validate({ body: createUserSchema })])
  async create(req: Request) {
    return req.resHandler.created(await createUser(req.body));
  }
}
```

Export the class from `src/controllers/index.ts` — that's the whole wiring.

## Quick start

```bash
npm create chassis my-api             # interactive scaffolder (pick your modules)
npm create chassis my-api -- --bare   # minimal build: no integrations, no Docker
```

Or use the template directly:

```bash
git clone https://github.com/dvd90/node-ts-express-bp.git my-api
cd my-api && npm install && npm run dev
```

That's it — no database, no env file, no accounts needed. Open http://localhost:8000/status.

## Features

- **TypeScript 5 + Express 5** — strict types, async errors caught automatically
- **Decorator routing** — `@route` / `@protectedRoute` on controller methods, controllers auto-mount
- **Consistent responses** — `req.resHandler.ok() / .notFound() / .validation()` with structured logging
- **Request correlation** — every request gets a `callId` (or propagates `x-call-id`), echoed in responses and logs
- **Typed, validated config** — zod-checked environment via `src/config`; the app refuses to boot on bad config
- **Zod input validation** — `validate({ body, query, params })` middleware with structured 400s
- **Opt-in integrations** — MongoDB (Mongoose), Auth0 (JWT), Sentry: enabled by env var, never required
- **Health endpoints** — `/healthz` (liveness) and `/readyz` (readiness, checks enabled integrations)
- **Graceful shutdown** — drains connections and closes integrations on SIGTERM/SIGINT
- **Vitest + supertest** — fast tests against the pure app factory, no server or DB needed
- **Code generator** — `npm run gen user` scaffolds a controller + test, wired up
- **Production Docker** — multi-stage build, non-root user, plus docker-compose with Mongo for dev
- **CI + Renovate** — GitHub Actions verify pipeline and automated dependency updates

## Scripts

| Command                           | What it does                                |
| --------------------------------- | ------------------------------------------- |
| `npm run dev`                     | Start with hot reload (tsx watch)           |
| `npm test` / `npm run test:watch` | Run the vitest suite                        |
| `npm run verify`                  | Typecheck + lint + test (CI runs this)      |
| `npm run build` / `npm start`     | Compile to `dist/` and run production build |
| `npm run gen <Name>`              | Generate a controller + test                |
| `npm run lint` / `npm run format` | ESLint / Prettier                           |

## Enabling integrations

Copy `.env.example` to `.env`. Each integration turns on when its variables are set — and stays completely dormant otherwise:

| Integration | Enable by setting                 | What you get                                              |
| ----------- | --------------------------------- | --------------------------------------------------------- |
| MongoDB     | `MONGODB_URI`                     | Mongoose connection, readiness check, graceful disconnect |
| Auth0       | `AUTH0_DOMAIN` + `AUTH0_AUDIENCE` | JWT verification on every `@protectedRoute`               |
| Sentry      | `SENTRY_DSN`                      | Automatic error reporting from the central error handler  |

Using a different IdP? Call `setAuthProvider([...yourMiddleware])` at boot and `@protectedRoute` uses it — see `src/core/auth.ts`.

## Project structure

```
src/
├── config/          # zod-validated env → typed config + feature flags
├── core/            # the framework: Routable, decorators, responses, errors, validation
├── middleware/      # callId correlation, dev request logging
├── integrations/    # opt-in modules: mongo, auth0, sentry
├── controllers/     # your endpoints — exported classes auto-mount
├── __tests__/       # vitest + supertest
├── app.ts           # pure app factory (no I/O — trivially testable)
└── server.ts        # boot: integrations → listen → graceful shutdown
```

Read more in [docs/architecture.md](docs/architecture.md) and [docs/modules.md](docs/modules.md).

## Docker

```bash
docker compose up --build     # API + MongoDB
docker build -t my-api .      # production image only
```

## License

[MIT](LICENSE)
