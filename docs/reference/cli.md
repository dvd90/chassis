# CLI & scripts reference

## `create-chassis`

```bash
npm create chassis my-api                    # interactive — pick a preset
npm create chassis my-api -- --preset lite   # SQLite + JWT, no infrastructure
npm create chassis my-api -- --yes           # Recommended API preset, no prompts
npm create chassis my-api -- --bare          # nothing — standalone build
npm create chassis my-api -- --db postgres --auth jwt --mcp   # à la carte
```

The interactive flow asks for **one preset**, then (only if you pick
`Custom`) walks you through each choice. Every choice is also a flag, so
nothing is interactive-only. Run `npm create chassis -- --help` for the
generated list of presets, choices, and toggles.

### Presets (`--preset <name>`)

| Preset    | Stack                                          |
| --------- | ---------------------------------------------- |
| `api`     | Postgres + JWT + Sentry + Docker (the default) |
| `lite`    | SQLite + JWT — zero external infrastructure    |
| `minimal` | No database, no auth — standalone              |

### Choices — pick exactly one of each

| Group           | Values                                   |
| --------------- | ---------------------------------------- |
| `--db <name>`   | `none` · `mongo` · `postgres` · `sqlite` |
| `--auth <name>` | `none` · `auth0` · `jwt` · `clerk`       |

Choosing a database brings its ORM: `mongo` → Mongoose, `postgres`/`sqlite`
→ Drizzle.

### Toggles — independent on/off

| Flag       | Module                                     |
| ---------- | ------------------------------------------ |
| `--sentry` | Sentry error reporting                     |
| `--mcp`    | MCP server exposing the API as agent tools |
| `--x402`   | x402 payment-gating via `@paidRoute`       |
| `--docker` | Dockerfile + docker-compose                |

### Other flags

| Flag           | Effect                                           |
| -------------- | ------------------------------------------------ |
| `--yes`, `-y`  | No prompts; use the `api` preset (or `--preset`) |
| `--bare`       | No prompts; the `minimal` preset, no Docker      |
| `--no-install` | Skip `npm install`                               |
| `--no-git`     | Skip `git init`                                  |
| _(no TTY)_     | Behaves like `--yes` — safe in CI                |

### What it does, in order

1. Downloads the template (GitHub tarball; requires `tar` on PATH)
2. Resolves your selection (preset → prompts → flags, flags win) and shows
   a confirmation summary
3. **Prunes everything not chosen** — deletes each declined module's files
   and directories, strips every line carrying its `chassis:<name>` marker,
   and removes its dependencies, devDependencies, and npm scripts from
   `package.json`. A dependency shared by a kept module (e.g. `drizzle-orm`,
   used by both Postgres and SQLite) is never removed.
4. Renames the package, resets the version, git-inits (optional), installs
   (optional)
5. **Makes the project the user's own** — rewrites the `LICENSE` copyright and
   removes the maintainer-only `docs/maintainers.md`

The generated project passes `npm run verify` and its `package.json` carries
only the dependencies the chosen modules need — no dead weight.

For developing the CLI itself, scaffold from a local checkout instead of the
network:

```bash
CHASSIS_TEMPLATE=/path/to/template node cli/index.mjs /tmp/test-app --bare
```

## `npm run gen <Name>`

Scaffolds a resource:

```bash
npm run gen user        # → UserController at /users
npm run gen BlogPost    # → BlogPostController at /blog-posts
```

Creates `src/controllers/<Name>.controller.ts`, a smoke test in
`src/__tests__/`, and appends the export to `src/controllers/index.ts`. It is
**database-aware**: it detects the installed DB and generates matching
persistence code —

- **Postgres / SQLite** — a controller wired to Drizzle, plus a table
  appended to `src/db/<engine>/schema.ts`. Generate the migration with
  `npx drizzle-kit generate --config src/db/<engine>/drizzle.config.ts`.
- **Mongo** — a Mongoose model in `src/db/mongo/` and a controller using it.
- **No database** — an in-memory skeleton.

Refuses to overwrite an existing controller.

## npm scripts

| Script               | What it does                                                  |
| -------------------- | ------------------------------------------------------------- |
| `npm run dev`        | Dev server with hot reload (`tsx watch`)                      |
| `npm run build`      | Compile to `dist/` (tests + `src/mcp` excluded)               |
| `npm start`          | Run the compiled server (`node dist/server.js`)               |
| `npm test`           | Run the vitest suite once                                     |
| `npm run test:watch` | Vitest in watch mode                                          |
| `npm run typecheck`  | `tsc --noEmit`                                                |
| `npm run lint`       | ESLint over the repo                                          |
| `npm run format`     | Prettier `--write`                                            |
| `npm run verify`     | typecheck + lint + test — what CI and the pre-commit hook run |
| `npm run gen <Name>` | Generate a controller (above)                                 |
| `npm run mcp`        | Start the MCP server over stdio (only with the MCP module)    |

## Git hooks

Husky runs `npm run verify` on pre-commit. Bypass in an emergency with
`git commit --no-verify` (CI will still catch you).
