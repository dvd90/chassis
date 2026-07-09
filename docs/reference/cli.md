# CLI & scripts reference

## `create-chassis`

```bash
npm create chassis my-api           # interactive
npm create chassis my-api -- --yes  # accept all defaults (everything included)
npm create chassis my-api -- --bare # decline all modules + Docker
```

| Flag          | Effect                                                   |
| ------------- | -------------------------------------------------------- |
| `--yes`, `-y` | Skip prompts, include every module                       |
| `--bare`      | Skip prompts, exclude MongoDB, Auth0, Sentry, and Docker |
| _(no TTY)_    | Behaves like `--yes` — safe in CI                        |

What it does, in order:

1. Downloads the template (GitHub tarball; requires `tar` on PATH)
2. Prompts for project directory and modules
3. **Prunes declined modules** — deletes their integration files, strips
   every line carrying their `chassis:<name>` marker, removes their
   dependencies from `package.json`
4. Renames the package, resets the version, git-inits (optional),
   installs (optional)
5. **Makes the project the user's own** — rewrites the `LICENSE`
   copyright to the new project name and current year, and removes the
   maintainer-only `docs/maintainers.md` (plus its index links)

The generated project passes `npm run verify` regardless of which
modules were declined.

For developing the CLI itself, scaffold from a local checkout instead of
the network:

```bash
CHASSIS_TEMPLATE=/path/to/template node cli/index.mjs /tmp/test-app --bare
```

## `npm run gen <Name>`

Scaffolds a resource:

```bash
npm run gen user        # → UserController at /users
npm run gen BlogPost    # → BlogPostController at /blog-posts
```

Creates `src/controllers/<Name>.controller.ts` (CRUD skeleton with a zod
create-schema), a smoke test in `src/__tests__/`, and appends the export
to `src/controllers/index.ts`. Refuses to overwrite an existing
controller.

## npm scripts

| Script               | What it does                                                  |
| -------------------- | ------------------------------------------------------------- |
| `npm run dev`        | Dev server with hot reload (`tsx watch`)                      |
| `npm run build`      | Compile to `dist/` (tests excluded via `tsconfig.build.json`) |
| `npm start`          | Run the compiled server (`node dist/server.js`)               |
| `npm test`           | Run the vitest suite once                                     |
| `npm run test:watch` | Vitest in watch mode                                          |
| `npm run typecheck`  | `tsc --noEmit`                                                |
| `npm run lint`       | ESLint over the repo                                          |
| `npm run format`     | Prettier `--write`                                            |
| `npm run verify`     | typecheck + lint + test — what CI and the pre-commit hook run |
| `npm run gen <Name>` | Generate a controller (above)                                 |

## Git hooks

Husky runs `npm run verify` on pre-commit. Bypass in an emergency with
`git commit --no-verify` (CI will still catch you).
