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

## Routine maintenance

### Weekly-ish

- Merge Renovate PRs once CI is green. CI runs `npm run verify` on
  Node 20 and 22, which covers typecheck, lint, and the test suite.

### When changing the template

- Keep the [module contract](modules.md) intact: anything specific to an
  optional integration stays on **single lines** tagged
  `// chassis:<name>`, or the CLI's pruning breaks.
- After touching integrations or markers, re-run the pruning smoke test:

  ```bash
  CHASSIS_TEMPLATE=. node cli/index.mjs /tmp/prune-test --bare
  cd /tmp/prune-test && npm install && npm run verify
  ```

  A pruned project must pass `verify` with zero warnings — that's the
  contract the CLI advertises.

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

## Support surface

Keep these in sync when the code changes — they're the public promise:

| Artifact        | Source of truth for                         |
| --------------- | ------------------------------------------- |
| `README.md`     | First impression, quick start               |
| `docs/`         | Everything else (index in `docs/README.md`) |
| `.env.example`  | Every supported variable                    |
| `cli/README.md` | npm package page for `create-chassis`       |
