# Maintainers guide

The step-by-step path from this repo to a public, reusable project —
and the routine for keeping it healthy afterwards.

## Going live

### 1. Rename the repository (once)

Rename to `chassis` (or `chassis-api`) in GitHub → Settings. GitHub
redirects old clone URLs automatically. Then update the references:

- [ ] `REPO` constant in `cli/index.mjs` (used for the template tarball)
- [ ] `repository.url` in `package.json` and `cli/package.json`
- [ ] Clone URLs in `README.md` and `docs/getting-started.md`

### 2. Flip the template switch (once)

GitHub → Settings → General → check **Template repository**. Visitors
get a "Use this template" button that creates a clean copy without your
git history.

### 3. Publish the CLI (once, then per release)

```bash
cd cli

# sanity check first — scaffold from the local template and verify it
CHASSIS_TEMPLATE=.. node index.mjs /tmp/chassis-smoke --bare
cd /tmp/chassis-smoke && npm install && npm run verify && cd -

# and once with the front end, which exercises the monorepo restructure
CHASSIS_TEMPLATE=.. node index.mjs /tmp/chassis-full --preset fullstack
cd /tmp/chassis-full && npm install && npm run verify && cd -

npm login
npm publish        # unscoped packages are public by default
```

Verify the flow end-to-end from a clean directory:

```bash
npm create chassis@latest smoke-test -- --yes
```

### 4. Enable Renovate (once)

Install the [Renovate GitHub app](https://github.com/apps/renovate) on
the repo — `renovate.json` is already configured (non-major updates are
grouped into a single PR). This is the single most important step for a
template: **templates rot silently**, and automated dependency PRs +
green CI are what keep it trustworthy for strangers.

Alternative: GitHub's own Dependabot (Settings → Code security).

## The web app

`web/` is a self-contained package with its own `package.json`, lockfile,
tsconfig and eslint config — it is **not** an npm workspace of the
template, because a project scaffolded without `--web` must stay a plain
single package. Install it separately:

```bash
npm install && npm ci --prefix web
```

Root `npm run verify` then delegates to it, and CI installs both. That
delegation is what keeps `web/` from rotting: it is typechecked, linted and
tested on every PR even though no generated project ever ships it in this
shape.

Its tests are deliberately narrow — `apiFetch`, the `/api/session` route
handler and the local-JWT middleware. Those hold the parts that would fail
silently and expensively: whether the bearer token is attached, and whether
the session token stays in an httpOnly cookie instead of reaching client
JavaScript. Rendering is left to `next build` in the scaffold suite.

Two files there exist only for this repo and never reach a generated
project — `web/auth/types.ts` and `web/auth/providers/conformance.ts`. The
latter typechecks all four auth providers against the same contract, which
is the only place that check can happen: a generated project keeps exactly
one provider, so a provider that drifts out of shape would otherwise break
only for whoever picked it. **Adding an auth provider means adding it
there too.**

## The documentation site

`site/` builds the published docs from the markdown in this repo — one
self-contained `dist/index.html` with sidebar nav, client-side search and
highlighted code, no server required.

```bash
npm ci --prefix site
npm run build --prefix site     # then open site/dist/index.html
npm run check --prefix site     # build without writing (what CI runs)
```

It holds **no prose of its own**: every page is rendered from `docs/**`,
`README.md` and `AGENTS.md`, so the site cannot drift from the repo. Adding
a doc means adding it to `site/pages.mjs` — the build fails on any markdown
file under `docs/` that no section lists, so a page can never be published
without a way to reach it.

Like `cli/`, `site/` is template-only: it is in the CLI's ignore list and
never reaches a generated project, and a scaffold test asserts that. Its
`marked` dependency therefore never lands in anyone's `package.json`.

Pushing to `master` publishes it via `.github/workflows/docs.yml`. That
needs **Settings → Pages → Source: GitHub Actions** enabled once.

The stylesheet in `site/theme.mjs` duplicates the tokens from
`web/app/globals.css` on purpose — the web app is a template that gets
copied into user projects, so it must not import from this build.

## chassis-mcp

`mcp-server/` is published separately as
[`chassis-mcp`](https://www.npmjs.com/package/chassis-mcp): an MCP server that
scaffolds Chassis projects, so an agent can create one without knowing the
CLI's flags.

```bash
npm ci --prefix mcp-server
npm test --prefix mcp-server    # drives it over stdio, like a real client
```

It **imports the option catalog from `create-chassis`** rather than restating
it, so it cannot advertise a stack the CLI does not support — and its tests run
against the CLI in this checkout via `CHASSIS_CLI`, so a change to
`cli/modules.mjs` fails here rather than in someone's agent.

Like `cli/` and `site/`, it is template-only and never reaches a generated
project. Note the directory is `mcp-server`, not `mcp`: the CLI's ignore list
matches by **basename**, so a top-level `mcp/` would also have excluded
`src/mcp` and silently broken the `--mcp` module.

Releasing it follows the same shape as the CLI — bump `mcp-server/package.json`,
`npm publish` from that directory, tag `mcp-v<version>`.

## Adding a top-level path

The CLI is versioned separately from the template it downloads: a release from
months ago still fetches today's `master`. So a new top-level directory leaks
into projects generated by **every already-published version** — which is
exactly how `mcp-server/` shipped in `create-chassis@0.3.0`.

Declare it in **`.chassisignore`** rather than in the CLI's ignore list. The
CLI reads that file from the template it downloads, so one template change
fixes every CLI version at once, with no release.

- A bare name matches any basename. Beware collisions: `mcp` would also match
  `src/mcp`, which is why the directory is `mcp-server`.
- An entry containing `/` matches a path relative to the repository root — use
  that for single files, like `.github/workflows/docs.yml`.

`node --test cli/scaffold.test.mjs` fails on any committed top-level path that
is neither declared there nor in the test's shipped list, so this cannot be
forgotten twice.

## Routine maintenance

### Weekly-ish

- Merge Renovate PRs once CI is green. CI runs `npm run verify` on
  Node 20 and 22, which covers typecheck, lint, and the test suite.

### When changing the template

- Keep the [module contract](modules.md) intact: anything specific to an
  optional integration stays on **single lines** tagged
  `// chassis:<name>`, or the CLI's pruning breaks.
- Two marker rules the test suite enforces, both learned the hard way:
  - The marker must be **last on the line**. A marker after an opening
    brace (`sqliteTable('users', { // chassis:jwt`) gets moved onto its own
    line by Prettier, and pruning then deletes the body but keeps the
    declaration. Put the construct in its own file and mark the import.
  - A module name must not appear as `chassis:<name>` anywhere else in the
    template. Pruning drops any line _containing_ the string, so naming a
    module `routes` would delete `Symbol('chassis:routes')` from
    `src/core/routable.ts`.
- After touching integrations or markers, run the scaffold suite:

  ```bash
  node --test cli/scaffold.test.mjs                  # catalog + structural
  SCAFFOLD_BUILD=1 node --test cli/scaffold.test.mjs # + install/verify/build
  ```

  The fast layers take seconds and cover the catalog, the CLI's failure
  modes, and every prune permutation. The build layer is the only one that
  runs `next build`, so it is the only thing that catches a front-end
  bundling break in a generated project — run it before releasing the CLI.

  A pruned project must pass `verify` **and** `build` with zero warnings —
  that's the contract the CLI advertises.

  Coverage is the thing to watch, not depth. `--auth jwt --db none` shipped
  broken (an import left unused once every database line was pruned) purely
  because no build case ever compiled that combination; any layer would have
  caught it. When you add a module, add the combination that empties out
  something else.

### Releasing CLI changes

1. Bump `version` in `cli/package.json` (semver: new prompts/flags =
   minor, fixes = patch).
2. `cd cli && npm publish`.
3. Tag the repo (`git tag cli-vX.Y.Z && git push --tags`) so CLI
   versions map to template states.

### Upgrading major dependencies

Express, Mongoose, ESLint, and the Sentry SDK occasionally ship breaking
majors. For each: read the migration guide, upgrade in a branch, run
`npm run verify` plus both CLI smoke tests (`--yes` and `--bare`), and
check the boot log still shows a clean standalone start.

#### TypeScript: on 6.0, ready for 7

The template is on **TypeScript 6.0**, the bridge release: it turns every TS 7
removal into an error while still being the JavaScript compiler the ecosystem
can introspect. Passing it clean is the real proof the template is 7-ready —
and `npx -y -p typescript@7 tsc --noEmit` does exit 0 here, root and `web/`.

**The version is pinned with `~`, not `^`, on purpose.** typescript-eslint
supports `<6.1.0`, and the CLI scaffolds projects **without a lockfile** — so a
caret would resolve to 6.1 the day it ships and break `npm run verify` for
every new project. Loosen it only once typescript-eslint's peer range moves.
Both `package.json` and `web/package.json` are pinned this way.

Going to 7 is blocked on the same package: 7.0 ships **no programmatic compiler
API** (that lands in 7.1), so typescript-eslint cannot run on it at all — nor
can ts-jest, ts-morph, or the Vue/Svelte/Astro template checkers. `npm run lint`
breaks the moment `typescript@7` is installed; `verify` fails on the lint leg,
never the compile leg. When that clears, the upgrade is a version bump and
nothing else. The work is already in the template:

- `moduleResolution: "node16"` in `tsconfig.json`. TS 7 removed
  `node`/`node10`. Output stays CommonJS (no `"type": "module"`), so `dist/`,
  `npm start` and the Dockerfile are unchanged.
- `jose` is imported dynamically in `src/integrations/jwt.ts` and
  `src/controllers/Auth.controller.ts`. It publishes no `require` condition,
  so a static import from a CommonJS file is a `TS1479` error under `node16`.
  `node16` also emits a real `import()` rather than downleveling it to
  `require`, which is what makes an ESM-only package work in the CJS build.
- `declare module '*.css'` in `web/types/next.d.ts`. Next types
  `*.module.css` but not plain global stylesheets, and TS 6 stopped letting an
  unresolvable side-effect import pass (`TS2882`).
- `experimentalDecorators` survives in TS 7, and there is no
  `emitDecoratorMetadata` or `reflect-metadata` here, so `@route` needs
  nothing. That is the part that breaks other decorator frameworks.

To try the new compiler without touching `verify`:
`npx -y -p typescript@7 tsc --noEmit -p tsconfig.build.json`.

## Support surface

Keep these in sync when the code changes — they're the public promise:

| Artifact        | Source of truth for                         |
| --------------- | ------------------------------------------- |
| `README.md`     | First impression, quick start               |
| `docs/`         | Everything else (index in `docs/README.md`) |
| `.env.example`  | Every supported variable                    |
| `cli/README.md` | npm package page for `create-chassis`       |
