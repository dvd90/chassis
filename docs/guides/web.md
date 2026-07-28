# Web front end

`--web` adds a Next.js 15 App Router front end and turns the project into
an **npm-workspaces monorepo**. Without the flag nothing changes: the
project stays a single package, exactly as it is today.

```bash
npm create chassis my-app -- --preset fullstack     # Postgres + JWT + web
npm create chassis my-app -- --web --auth clerk     # à la carte
```

## Layout

```
my-app/
  package.json          # workspaces root: dev / build / verify / format
  apps/api/             # the Chassis backend — src, scripts, Dockerfile
  apps/web/             # the Next.js app
  docs/  README.md  docker-compose.yml  .github/
```

`npm run dev` at the root starts both (API on `:8000`, web on `:3000`).
`npm run verify` runs each workspace's own verify. `npm run gen <Name>`
still scaffolds a resource — it forwards to `apps/api`.

Nothing forces you into npm workspaces beyond the root `package.json`:
there is no monorepo tool, no build graph, no plugin versions to keep in
step. Two apps do not need a task orchestrator; if the repo grows to the
point where one earns its keep, adding it later is a `package.json` edit.

## Talking to the API

`apps/web/lib/api.ts` is the whole client:

```ts
const status = await apiFetch<Status>('/status');
```

It runs **server-side only** — it reads the session to attach
`Authorization: Bearer <token>`, and a token must never be exposed to the
browser. Call it from server components and route handlers. Point
`API_URL` at the backend (`.env.local`, defaults to `http://localhost:8000`).

## Swapping auth providers

Every provider lives in `apps/web/auth/providers/` and exports the same
five things. The app never names one directly — it imports from
`auth/active.ts`, which is a single re-export line:

```ts
// apps/web/auth/active.ts
export * from './providers/jwt';
```

That line (and its twin in `active-middleware.ts`, kept separate so the
middleware bundle stays free of React and `next/headers`) is what
`create-chassis` rewrites for `--auth`. Changing provider afterwards means
editing it, installing the new SDK, and swapping the env vars.

The generated project keeps only the provider you chose. In the Chassis
repo itself all four coexist, and
`apps/web/auth/providers/conformance.ts` typechecks each one against the
`AuthModule` contract — so a provider that drifts out of shape fails CI
here rather than in someone's generated project. That file is
template-only and never ships.

## Pages

| Route      | What it demonstrates                                             |
| ---------- | ---------------------------------------------------------------- |
| `/`        | server component calling the API, with the token if there is one |
| `/sign-in` | the active provider's `SignInPanel`                              |
| `/account` | protected: redirects when signed out, then makes an authed call  |

`/account` is guarded twice on purpose — middleware redirects the obvious
cases, and the page re-checks. Middleware alone is never the guard.

## Docker

`docker-compose.yml` builds the API from `apps/api`. The Dockerfile there
uses `npm install` rather than `npm ci`, because the workspace lockfile
lives at the repo root and is not part of that build context. The web app
has no compose service — deploy it wherever you deploy Next.
