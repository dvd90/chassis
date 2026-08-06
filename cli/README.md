# create-chassis

Scaffold a [Chassis](https://github.com/dvd90/chassis) backend — a lightweight,
decorator-driven **Express 5 + TypeScript** starter. Pick a stack (or a preset),
and the CLI generates a project containing **only what you chose**: no unused
files, no unused dependencies.

**[📖 Documentation](https://dvd90.github.io/chassis/)** ·
[Getting started](https://dvd90.github.io/chassis/#getting-started) ·
[GitHub](https://github.com/dvd90/chassis)

```bash
npm create chassis my-api
# or: npx create-chassis my-api
```

The CLI itself has **zero dependencies** and runs on **Node 20+**.

---

## Table of contents

- [Quick start](#quick-start)
- [Presets](#presets)
- [Choices — pick one of each](#choices--pick-one-of-each)
- [Toggles — independent add-ons](#toggles--independent-add-ons)
- [Front end](#front-end)
- [All flags](#all-flags)
- [Interactive vs. non-interactive](#interactive-vs-non-interactive)
- [What gets generated](#what-gets-generated)
- [The generated project](#the-generated-project)
- [Requirements](#requirements)
- [Developing the CLI](#developing-the-cli)

---

## Quick start

```bash
npm create chassis my-api                    # interactive — pick a preset
npm create chassis my-api -- --preset lite   # SQLite + JWT, no infrastructure
npm create chassis my-api -- --yes           # Recommended API preset, no prompts
npm create chassis my-api -- --bare          # nothing — standalone build
npm create chassis my-app -- --preset fullstack               # + Next.js front end
npm create chassis my-api -- --db postgres --auth jwt --mcp   # à la carte
```

> When passing flags through `npm create`, put them after `--` as shown.
> With `npx create-chassis` you can pass flags directly.

The interactive flow asks for **one preset**; pick `Custom` to choose each
module yourself. It ends with a confirmation summary before writing anything.

---

## Presets

`--preset <name>`

| Preset      | Stack                                                    |
| ----------- | -------------------------------------------------------- |
| `api`       | Postgres + JWT + Sentry + Docker — the default           |
| `fullstack` | `api` **plus a Next.js front end** (workspaces monorepo) |
| `lite`      | SQLite + JWT — zero external infrastructure              |
| `minimal`   | No database, no auth — standalone                        |

---

## Choices — pick one of each

These are mutually exclusive groups. Choosing a database brings its ORM along.

| Group           | Values                                   | ORM                |
| --------------- | ---------------------------------------- | ------------------ |
| `--db <name>`   | `none` · `mongo` · `postgres` · `sqlite` | Mongoose / Drizzle |
| `--auth <name>` | `none` · `auth0` · `clerk` · `jwt` · `magic-only` · `password+magic` | — |

- **`mongo`** — MongoDB via Mongoose.
- **`postgres`** — Postgres via Drizzle (the flagship SQL stack).
- **`sqlite`** — SQLite via Drizzle; zero-infra, in-memory by default.
- **`auth0` / `clerk` / the local variants** — all register through one pluggable
  `setAuthProvider()` seam behind the `@protectedRoute` decorator.

---

## Toggles — independent add-ons

| Flag       | Module                                                            |
| ---------- | ----------------------------------------------------------------- |
| `--sentry` | Sentry error reporting                                            |
| `--mcp`    | MCP server exposing the API to AI agents as tools (`npm run mcp`) |
| `--x402`   | x402 payment-gating via the `@paidRoute` decorator                |
| `--web`    | Next.js front end — see [Front end](#front-end)                   |
| `--docker` | Dockerfile + docker-compose (with your database)                  |

---

## Front end

`--web` adds a **Next.js 15** App Router front end and turns the project into an
npm-workspaces monorepo. Without it the layout is unchanged: a single package.

```
my-app/
  package.json      # workspaces root: dev · build · verify
  apps/api/         # the Chassis backend
  apps/web/         # the Next.js app
```

`npm run dev` runs both (API on `:8000`, web on `:3000`); `npm run verify` and
`npm run build` fan out to each workspace.

The auth provider you picked is wired on **both** sides. Every provider exports
the same five things, and the app imports them from `auth/active.ts` — a single
re-export line the scaffolder rewrites, so nothing else in the app names a
provider:

| `--auth` | Front end                                                                   |
| -------- | --------------------------------------------------------------------------- |
| local    | sign-in form → `/api/session/*` → the API → **httpOnly cookies**            |
| `auth0`  | `@auth0/nextjs-auth0`, with the API audience set so you get an access token |
| `clerk`  | `@clerk/nextjs` — `<SignIn/>` and `auth().getToken()`                       |
| `none`   | no sign-in; requests go out unauthenticated                                 |

With a local auth variant the API also gains its own sign-in endpoints and a
session layer (short-lived access token, rotating refresh token with reuse
detection), with identities stored in whichever database you chose — or in
memory when you chose none. Emailed-link sign-in delivers through a transport
seam; Chassis binds no email provider.

---

## All flags

| Flag              | Effect                                                        |
| ----------------- | ------------------------------------------------------------- |
| `--preset <name>` | `api` · `fullstack` · `lite` · `minimal` (see above)          |
| `--db <name>`     | Database choice (see above)                                   |
| `--auth <name>`   | Auth choice (see above)                                       |
| `--sentry`        | Include Sentry                                                |
| `--mcp`           | Include the MCP server                                        |
| `--x402`          | Include x402 payments                                         |
| `--web`           | Include the Next.js front end (monorepo layout)               |
| `--docker`        | Include Docker (`--no-docker` to exclude)                     |
| `--yes`, `-y`     | No prompts; use the `api` preset (or the one from `--preset`) |
| `--bare`          | No prompts; the `minimal` preset, no Docker                   |
| `--no-install`    | Skip `npm install`                                            |
| `--no-git`        | Skip `git init`                                               |
| `-h`, `--help`    | Print the generated flag/variant reference                    |

Explicit flags always win over the preset and prompts. Invalid values fail with
the list of valid ones. Run `npm create chassis -- --help` for the live
reference (it's generated from the module catalog, so it never drifts).

---

## Interactive vs. non-interactive

- **Interactive** (a TTY, no `--yes`/`--bare`): preset menu → optional Custom
  choices → confirmation summary.
- **Non-interactive** (`--yes`, `--bare`, or no TTY — e.g. CI): no prompts. `--yes`
  uses the `api` preset; `--bare` uses `minimal`. Combine with `--preset` and
  the choice/toggle flags for a precise, scriptable stack.

---

## What gets generated

The template ships with every module present; the CLI **prunes** everything you
didn't pick:

1. Downloads the template (GitHub tarball — needs `tar` on your PATH).
2. Resolves your selection (preset → prompts → flags; flags win).
3. **Removes declined modules** — their integration files and directories, every
   line carrying their marker, and their `dependencies`, `devDependencies`, and
   npm scripts. A dependency shared by a module you kept (e.g. `drizzle-orm`,
   used by both Postgres and SQLite) is never removed.
4. Renames the package, resets its version to `0.1.0`, and rewrites the LICENSE
   to you — the output is **your** project, not a fork of Chassis.
5. Optionally `git init`s and `npm install`s.

The result passes `npm run verify` (typecheck + lint + test), and its
`package.json` carries only the dependencies your chosen modules need.

---

## The generated project

- **Endpoints** are `@route`-decorated methods on a `Routable` controller;
  export the class from `src/controllers/index.ts` to mount it.
- **`npm run gen <Name>`** scaffolds a controller + test and is **DB-aware** — it
  wires the controller to your installed ORM (Drizzle or Mongoose) and, for
  Drizzle, appends a table to the schema.
- **`npm run mcp`** starts the MCP server over stdio (only with `--mcp`).
- **`npm run verify`** — typecheck + lint + test; the quality gate.
- Every integration is opt-in via an environment variable — see the generated
  `.env.example`. The app boots standalone with none set.

Full documentation ships inside every project (`README.md`, `AGENTS.md`,
`docs/`) and lives at
[github.com/dvd90/chassis](https://github.com/dvd90/chassis).

---

## Requirements

- **Node 20+**
- **`tar`** on your PATH (used to unpack the downloaded template; preinstalled on
  macOS, Linux, and modern Windows)
- **git** — optional; only for `git init` at the end

---

## Developing the CLI

Point it at a local template checkout instead of the network:

```bash
CHASSIS_TEMPLATE=/path/to/chassis node index.mjs /tmp/test-app --bare
```

The scaffolding logic is covered by an integration test that builds every
project type and asserts each installs, verifies, and ships only the files and
packages its chosen modules need:

```bash
node --test scaffold.test.mjs                  # structural checks (fast)
SCAFFOLD_BUILD=1 node --test scaffold.test.mjs  # + npm install & verify
```
