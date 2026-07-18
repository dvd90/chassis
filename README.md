# 🏎️ Chassis

**A lightweight, decorator-driven Express + TypeScript backend starter. Clone, run, ship.**

Chassis gives you NestJS-style controller ergonomics on plain Express 5 — in a handful of small files you can actually read. Zero configuration required: the server boots standalone, and every integration switches on only when you add its environment variable. Scaffold with a preset or pick à la carte — a database (Mongo, Postgres, or SQLite, ORM included), an auth provider (Auth0, JWT, or Clerk), Sentry, an MCP server, and x402 payments — and the CLI ships only what you chose.

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
npm create chassis my-api                    # interactive — pick a preset
npm create chassis my-api -- --preset lite   # SQLite + JWT, no infrastructure
npm create chassis my-api -- --bare          # minimal build: no modules, no Docker
npm create chassis my-api -- --db postgres --auth jwt --mcp   # à la carte
```

Or use the template directly:

```bash
git clone https://github.com/dvd90/chassis.git my-api
cd my-api && npm install && npm run dev
```

That's it — no database, no env file, no accounts needed. Open http://localhost:8000/status.

New here? Follow the **[step-by-step getting-started guide](docs/getting-started.md)** — zero to a tested API in ~10 minutes.

## Features

- **TypeScript 5 + Express 5** — strict types, async errors caught automatically
- **Decorator routing** — `@route` / `@protectedRoute` on controller methods, controllers auto-mount
- **Consistent responses** — `req.resHandler.ok() / .notFound() / .validation()` with structured logging
- **Request correlation** — every request gets a `callId` (or propagates `x-call-id`), echoed in responses and logs
- **Typed, validated config** — zod-checked environment via `src/config`; the app refuses to boot on bad config
- **Zod input validation** — `validate({ body, query, params })` middleware with structured 400s
- **Pick-your-stack scaffolder** — presets or à la carte: database + ORM (Mongo/Postgres/SQLite), auth (Auth0/JWT/Clerk), Sentry, MCP, x402 — the CLI prunes everything else so `package.json` carries only what you chose
- **Opt-in integrations** — every module enables by env var, never required
- **Payment-gated routes** — `@paidRoute('get', '/report', '$0.01')` via the x402 protocol (opt-in)
- **MCP server** — expose your API to AI agents as MCP tools (`npm run mcp`, opt-in)
- **Health endpoints** — `/healthz` (liveness) and `/readyz` (readiness, checks enabled integrations)
- **Graceful shutdown** — drains connections and closes integrations on SIGTERM/SIGINT
- **Vitest + supertest** — fast tests against the pure app factory, no server or DB needed
- **DB-aware code generator** — `npm run gen user` scaffolds a controller + test wired to your ORM (Drizzle or Mongoose)
- **Production Docker** — multi-stage build, non-root user, plus docker-compose with your database for dev
- **CI + Renovate** — GitHub Actions verify pipeline and automated dependency updates
- **AI-agent ready** — ships `AGENTS.md`, `CLAUDE.md`, `llms.txt`, and an `add-resource` skill so agents write code that matches the conventions (see below)

## AI-agent ready

Most people scaffolding a backend today have an AI agent in the loop. Chassis is built so that agent-written code reads like hand-written code — because the framework gives agents rails and a verifiable finish line:

- **`AGENTS.md` + `CLAUDE.md`** ship in every project — Claude Code, Cursor, Copilot, and Codex pick them up automatically and follow the conventions (thin controllers, `resHandler` responses, `throw AppError`, config in one place).
- **One obvious place for everything** means agent output converges on the same shape a maintainer would write — that's what keeps it readable.
- **`npm run verify`** (strict TypeScript + ESLint + tests) is a deterministic quality gate agents iterate against until green.
- **`.claude/skills/add-resource`** turns "add a books resource" into one consistent, checklisted operation.
- **`llms.txt`** gives doc-fetching tools a compact map of the conventions.

Nothing to install — it's all in the scaffold. See [AGENTS.md](AGENTS.md).

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

## Documentation

Full docs live in [`docs/`](docs/README.md):

- **[Getting started](docs/getting-started.md)** — step-by-step tutorial
- **Guides** — [building an API](docs/guides/building-an-api.md) · [authentication](docs/guides/authentication.md) · [deployment](docs/guides/deployment.md)
- **Concepts** — [architecture](docs/architecture.md) · [modules & integrations](docs/modules.md)
- **Reference** — [configuration](docs/reference/configuration.md) · [core API](docs/reference/core-api.md) · [CLI & scripts](docs/reference/cli.md)
- **[Maintainers guide](docs/maintainers.md)** — publishing, releases, keeping the template fresh

## Docker

```bash
docker compose up --build     # API + MongoDB
docker build -t my-api .      # production image only
```

## License

[MIT](LICENSE)
