# Getting started

From nothing to a running, tested API. Total time: about 10 minutes.

## Prerequisites

- **Node.js 20 or newer** (`node -v`)
- That's it. No database, no accounts, no Docker required to start.

## Step 1 — Create your project

**Option A — the scaffolder (recommended):**

```bash
npm create chassis my-api
```

Answer the prompts — each module you decline is completely removed from
the generated project (files, dependencies, config):

```
🏎️  create-chassis — Express + TypeScript, ready to drive

Include MongoDB (Mongoose)? (Y/n)
Include Auth0 JWT auth? (Y/n)
Include Sentry error reporting? (Y/n)
Include Docker (Dockerfile + compose)? (Y/n)
Initialize a git repository? (Y/n)
Run npm install now? (Y/n)
```

Shortcuts: `--yes` accepts everything, `--bare` declines every optional
module for the smallest possible starting point.

**Option B — use the template directly:**

```bash
git clone https://github.com/dvd90/chassis.git my-api
cd my-api
rm -rf .git && git init
npm install
```

## Step 2 — Run it

```bash
cd my-api
npm run dev
```

```
info No integrations configured — running standalone
info 🏎️  Chassis running on http://localhost:8000
```

Check it's alive:

```bash
curl http://localhost:8000/status
# {"status":"up","uptime":2.14}
```

Note there was no configuration step. Chassis boots with zero env vars;
integrations activate later, when you add theirs ([step 7](#step-7--enable-an-integration-when-you-need-it)).

## Step 3 — Add your first endpoint

```bash
npm run gen todo
```

This creates `src/controllers/Todo.controller.ts` (a CRUD skeleton), a
matching test, and wires the export into `src/controllers/index.ts`.
The dev server picks it up on save:

```bash
curl http://localhost:8000/todos
# {"items":[]}
```

## Step 4 — Understand what you're looking at

Open the generated controller:

```ts
export class TodoController extends Routable {
  constructor() {
    super('/todos'); // base path — every route below is relative to it
  }

  @route('get', '/')
  async index(req: Request): Promise<Response> {
    return req.resHandler.ok({ items: [] });
  }

  @route('post', '/', [validate({ body: createTodoSchema })])
  async create(req: Request): Promise<Response> {
    return req.resHandler.created({ item: req.body });
  }
}
```

Three ideas carry the whole framework:

1. **`@route` declares endpoints.** Export the class from
   `src/controllers/index.ts` and it auto-mounts. No router files.
2. **`req.resHandler` sends responses.** `ok`, `created`, `notFound`,
   `validation`, … — every response is logged with a correlation id.
3. **Just throw for errors.** `throw new AppError(ERROR_CODES.NOT_FOUND, '...')`
   anywhere; the central handler maps it to a clean JSON response.

More depth: [Architecture](architecture.md) · [Core API](reference/core-api.md).

## Step 5 — Run the tests

```bash
npm test
```

Tests hit the app factory directly with supertest — no port, no database,
so they run in about a second. Try `npm run test:watch` while developing.

## Step 6 — Verify like CI does

```bash
npm run verify   # typecheck + lint + test
```

The pre-commit hook and the GitHub Actions workflow both run exactly
this, so green locally means green in CI.

## Step 7 — Enable an integration (when you need it)

```bash
cp .env.example .env
```

Set a variable, restart, done:

| You set                                        | You get                                                      |
| ---------------------------------------------- | ------------------------------------------------------------ |
| `MONGODB_URI=mongodb://localhost:27017/my-api` | Mongoose connected, `/readyz` checks it, graceful disconnect |
| `AUTH0_DOMAIN` + `AUTH0_AUDIENCE`              | JWT verification on every `@protectedRoute`                  |
| `SENTRY_DSN`                                   | Unexpected errors reported to Sentry                         |

No MongoDB running? `docker compose up mongo` starts one (if you kept
the Docker module). Full walkthroughs: [Building an API](guides/building-an-api.md)
and [Authentication](guides/authentication.md).

## Step 8 — Build for production

```bash
npm run build    # compiles to dist/
npm start        # runs dist/server.js
```

Or build the production Docker image — multi-stage, non-root, ~150 MB:

```bash
docker build -t my-api .
docker run -p 8000:8000 my-api
```

## Where to go next

- [Building an API](guides/building-an-api.md) — a real CRUD resource with
  a Mongoose model, validation, and tests
- [Authentication](guides/authentication.md) — protect routes with Auth0
  or your own provider
- [Deployment](guides/deployment.md) — ship it
