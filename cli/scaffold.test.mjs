/**
 * Integration test for create-chassis pruning.
 *
 *   node --test cli/scaffold.test.mjs                  # fast layers only
 *   SCAFFOLD_BUILD=1 node --test cli/scaffold.test.mjs # + install & verify
 *
 * Four layers, cheapest first:
 *
 *   - CATALOG (no scaffolding): the module catalog is data the CLI acts on
 *     blindly — a renamed file, a renamed dependency or a mistyped marker
 *     does not throw, it just quietly stops pruning. These assertions are
 *     what turns that class of bug into a failing test.
 *   - CLI CONTRACT: bad input fails loudly and destroys nothing.
 *   - STRUCTURAL: scaffold every variant and assert the result carries
 *     exactly the right deps/files, that no marker survives, and — the other
 *     half of the guarantee — that kept modules keep every marked line.
 *   - BUILD (SCAFFOLD_BUILD=1): npm install, `npm run verify` and
 *     `npm run build` on projects that together exercise every DB, auth
 *     provider and layout, plus the DB-aware generator. `build` is the only
 *     layer that runs `next build`, so it is the only one that can catch a
 *     front-end middleware or bundling break.
 *
 * The oracle for deps/files is derived from the template and the catalog,
 * never from the CLI's own removal loop, so a pruning bug is caught rather
 * than mirrored.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { MODULES, GROUPS, PRESETS, MONOREPO, descriptor } from './modules.mjs';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const cliPath = path.join(repoRoot, 'cli', 'index.mjs');

// ── Independent oracle ──────────────────────────────────────
// Base = template deps minus every module's deps. Derived from the template
// package.json and the module catalog, NOT from the CLI's removal loop — so a
// pruning bug is caught rather than mirrored.
const templatePkg = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
);

/** Every module + group-variant name (excluding the empty `none`). */
function allNames() {
  const names = Object.keys(MODULES);
  for (const group of Object.values(GROUPS)) {
    for (const key of Object.keys(group.variants)) {
      if (key !== 'none') names.push(key);
    }
  }
  return names;
}

const allModuleDeps = new Set();
const allModuleDevDeps = new Set();
for (const name of allNames()) {
  const d = descriptor(name);
  for (const dep of d.deps ?? []) allModuleDeps.add(dep);
  for (const dep of d.devDeps ?? []) allModuleDevDeps.add(dep);
}

const BASE_DEPS = new Set(
  Object.keys(templatePkg.dependencies ?? {}).filter(
    (d) => !allModuleDeps.has(d)
  )
);
const BASE_DEV_DEPS = new Set(
  Object.keys(templatePkg.devDependencies ?? {}).filter(
    (d) => !allModuleDevDeps.has(d)
  )
);

// The web app keeps its own package.json; the same oracle applies to it.
const templateWebPkg = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'web', 'package.json'), 'utf8')
);
const allWebDeps = new Set();
for (const name of allNames()) {
  for (const dep of descriptor(name).web?.deps ?? []) allWebDeps.add(dep);
}
const BASE_WEB_DEPS = new Set(
  Object.keys(templateWebPkg.dependencies ?? {}).filter(
    (d) => !allWebDeps.has(d)
  )
);

/**
 * Where a template-relative path lands, given the layout. Declining the web
 * app leaves the single-package layout untouched; keeping it hoists the API
 * into apps/api and the front end into apps/web.
 */
function resolvePath(dir, file, monorepo) {
  if (!monorepo) return path.join(dir, file);
  if (file === 'web' || file.startsWith('web/')) {
    return path.join(dir, path.dirname(MONOREPO.webDir), file);
  }
  return path.join(dir, MONOREPO.apiDir, file);
}

// ── Helpers ─────────────────────────────────────────────────

/** Scaffold into a fresh temp dir with the given flags; returns its path. */
function scaffold(flags) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chassis-test-'));
  const target = path.join(tmp, 'app');
  const res = spawnSync(
    'node',
    [cliPath, target, '--no-install', '--no-git', ...flags],
    { env: { ...process.env, CHASSIS_TEMPLATE: repoRoot }, encoding: 'utf8' }
  );
  assert.equal(res.status, 0, `CLI failed for [${flags}]:\n${res.stderr}`);
  return target;
}

function readPkg(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
}

function assertSameSet(actualKeys, expectedSet, label) {
  const actual = new Set(actualKeys);
  const useless = [...actual].filter((x) => !expectedSet.has(x));
  const missing = [...expectedSet].filter((x) => !actual.has(x));
  assert.ok(
    useless.length === 0 && missing.length === 0,
    `${label}: useless [${useless.join(', ')}] missing [${missing.join(', ')}]`
  );
}

const NOT_WALKED = ['node_modules', '.git', '.next', 'dist', 'coverage'];

/**
 * The marker name in the trailing-comment position the CLI strips, if any.
 * Only this position is a marker; `Symbol('chassis:routes')` in src/core is
 * ordinary code that happens to share the prefix.
 */
function trailingMarker(line) {
  return line.match(/chassis:(\w+)\s*$/)?.[1];
}

/** Every `chassis:x` on a line, marker or not, as bare names. */
function allMarkerLikeNames(line) {
  return (line.match(/chassis:(\w+)/g) ?? []).map((m) =>
    m.slice('chassis:'.length)
  );
}

function walkText(dir, out = [], skip = NOT_WALKED) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.includes(entry.name)) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkText(full, out, skip);
    } else if (
      /\.(ts|mjs|yml|yaml|json|example)$/.test(entry.name) ||
      entry.name === '.env.example'
    ) {
      out.push(full);
    }
  }
  return out;
}

/** The heart of the test: assert the scaffold carries exactly `keptNames`. */
function assertScaffold(dir, keptNames) {
  const monorepo = keptNames.includes('web');
  const at = (file) => resolvePath(dir, file, monorepo);
  const pkg = readPkg(monorepo ? path.join(dir, MONOREPO.apiDir) : dir);
  const declined = allNames().filter((n) => !keptNames.includes(n));

  // 1 & 2. Dependencies/devDependencies are exactly base + kept modules.
  const deps = new Set(BASE_DEPS);
  const devDeps = new Set(BASE_DEV_DEPS);
  for (const name of keptNames) {
    const d = descriptor(name);
    for (const dep of d.deps ?? []) deps.add(dep);
    for (const dep of d.devDeps ?? []) devDeps.add(dep);
  }
  // In a monorepo the repo-wide tooling lives at the workspace root rather
  // than in apps/api — it is moved, never dropped.
  const hoisted = new Set();
  if (monorepo) {
    for (const dep of MONOREPO.rootDevDeps) {
      if (devDeps.delete(dep)) hoisted.add(dep);
    }
  }

  assertSameSet(Object.keys(pkg.dependencies ?? {}), deps, 'dependencies');
  assertSameSet(
    Object.keys(pkg.devDependencies ?? {}),
    devDeps,
    'devDependencies'
  );

  // 3. Kept modules' files exist; declined modules' files are gone. Web
  //    files follow the same rule — a declined auth provider must leave no
  //    trace in the front end either.
  for (const name of keptNames) {
    for (const file of descriptor(name).files ?? []) {
      assert.ok(fs.existsSync(at(file)), `kept ${name}: no ${file}`);
    }
    if (!monorepo) continue;
    for (const file of descriptor(name).web?.files ?? []) {
      assert.ok(fs.existsSync(at(file)), `kept ${name}: no web file ${file}`);
    }
  }
  for (const name of declined) {
    for (const file of [
      ...(descriptor(name).files ?? []),
      ...(descriptor(name).crossFiles ?? []),
      ...(descriptor(name).web?.files ?? [])
    ]) {
      assert.ok(
        !fs.existsSync(at(file)) && !fs.existsSync(path.join(dir, file)),
        `declined module ${name}: leftover file ${file}`
      );
    }
  }

  // 4. Not one marker survives in the code — declined modules take their
  //    whole line, kept ones have the marker text stripped. (Docs keep
  //    theirs: they describe the full module system.)
  for (const file of walkText(dir)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const marker = trailingMarker(line);
      assert.ok(
        !marker,
        `leftover chassis:${marker} in ${path.relative(dir, file)}: ${line.trim()}`
      );
    }
  }

  // 5. The `mcp` npm script exists iff MCP was kept.
  assert.equal(
    Boolean(pkg.scripts?.mcp),
    keptNames.includes('mcp'),
    'scripts.mcp presence'
  );

  // 6. No npm script may invoke a script that pruning removed, and none may
  //    reach for a path outside its own package.
  const defined = new Set(Object.keys(pkg.scripts ?? {}));
  for (const body of Object.values(pkg.scripts ?? {})) {
    for (const [, called] of body.matchAll(/npm run ([\w:-]+)/g)) {
      assert.ok(defined.has(called), `script calls missing "${called}"`);
    }
    assert.ok(
      !monorepo || !body.includes('--prefix web'),
      `apps/api script reaches for web/: ${body}`
    );
  }

  // 7. Layout: a workspaces root with two apps, or the untouched single
  //    package — never a half-migrated mix.
  const rootPkg = readPkg(dir);
  if (monorepo) {
    assert.deepEqual(
      rootPkg.workspaces,
      [MONOREPO.apiDir, MONOREPO.webDir],
      'workspaces'
    );
    assert.ok(!fs.existsSync(path.join(dir, 'src')), 'src left at the root');
    assert.ok(!fs.existsSync(path.join(dir, 'web')), 'web left at the root');
    assert.ok(!rootPkg.dependencies, 'root package.json carries dependencies');
    assertSameSet(
      Object.keys(rootPkg.devDependencies ?? {}),
      hoisted,
      'root devDependencies'
    );

    const webPkg = readPkg(path.join(dir, MONOREPO.webDir));
    const webDeps = new Set(BASE_WEB_DEPS);
    for (const name of keptNames) {
      for (const dep of descriptor(name).web?.deps ?? []) webDeps.add(dep);
    }
    assertSameSet(
      Object.keys(webPkg.dependencies ?? {}),
      webDeps,
      'web dependencies'
    );

    // The provider switch really points at the chosen provider, and the
    // template-only conformance check does not ship.
    const provider =
      GROUPS.auth.variants[
        keptNames.find((n) => GROUPS.auth.variants[n]) ?? 'none'
      ]?.web?.provider ?? 'none';
    const active = fs.readFileSync(
      path.join(dir, MONOREPO.webDir, 'auth/active.ts'),
      'utf8'
    );
    assert.match(active, new RegExp(`from '\\./providers/${provider}'`));
    for (const gone of ['auth/types.ts', 'auth/providers/conformance.ts']) {
      assert.ok(
        !fs.existsSync(path.join(dir, MONOREPO.webDir, gone)),
        `template-only file shipped: ${gone}`
      );
    }
  } else {
    assert.ok(!rootPkg.workspaces, 'unexpected workspaces in single package');
    assert.ok(fs.existsSync(path.join(dir, 'src')), 'src missing');
    assert.ok(!fs.existsSync(path.join(dir, 'apps')), 'unexpected apps/');
  }

  // 8. The project is the user's own, not a copy of Chassis: template-only
  //    artifacts are gone and the identity fields are reset.
  for (const gone of [
    'docs/maintainers.md',
    'cli',
    '.history',
    'node_modules',
    'package-lock.json'
  ]) {
    assert.ok(!fs.existsSync(path.join(dir, gone)), `shipped ${gone}`);
  }

  assert.equal(rootPkg.name, path.basename(dir), 'project name');
  assert.equal(rootPkg.version, '0.1.0', 'project version');
  assert.ok(!rootPkg.repository, 'inherited Chassis repository field');
  assert.match(
    fs.readFileSync(path.join(dir, 'LICENSE'), 'utf8'),
    new RegExp(`Copyright \\(c\\) \\d{4} ${path.basename(dir)}`),
    'LICENSE still credits the template author'
  );

  // A deleted doc must leave no dead link behind.
  for (const doc of ['README.md', 'docs/README.md']) {
    const full = path.join(dir, doc);
    if (!fs.existsSync(full)) continue;
    assert.ok(
      !fs.readFileSync(full, 'utf8').includes('maintainers.md'),
      `${doc} links to the deleted maintainers guide`
    );
  }
}

function npm(args, dir) {
  return spawnSync('npm', args, { cwd: dir, encoding: 'utf8' });
}

// ── Catalog integrity (no scaffolding — fast) ───────────────
// The catalog is data the CLI acts on blindly. A renamed file, a renamed
// dependency, or a mistyped marker does not throw: the module quietly stops
// being pruned and the bug ships. These assertions are what stands in the
// way, and they are cheap enough to never skip.

/** Everything a descriptor can point at, as template-relative paths. */
function declaredPaths(d) {
  return [...(d.files ?? []), ...(d.crossFiles ?? []), ...(d.web?.files ?? [])];
}

test('catalog: every module name is unique and resolvable', () => {
  const names = allNames();
  assert.equal(
    names.length,
    new Set(names).size,
    `duplicate module name in the catalog: [${names.join(', ')}]`
  );
  for (const name of names) {
    assert.ok(descriptor(name), `descriptor("${name}") does not resolve`);
  }
  // `none` is the empty variant; it must never carry files or deps.
  for (const group of Object.values(GROUPS)) {
    assert.deepEqual(
      Object.keys(group.variants.none),
      ['label'],
      `${group.label}: the "none" variant declares more than a label`
    );
  }
});

test('catalog: every declared file exists in the template', () => {
  for (const name of allNames()) {
    for (const file of declaredPaths(descriptor(name))) {
      assert.ok(
        fs.existsSync(path.join(repoRoot, file)),
        `${name} declares "${file}", which is not in the template`
      );
    }
  }
});

test('catalog: no file is claimed by two different modules', () => {
  const owner = new Map();
  for (const name of allNames()) {
    for (const file of descriptor(name).files ?? []) {
      const previous = owner.get(file);
      assert.ok(
        !previous,
        `"${file}" is claimed by both ${previous} and ${name}`
      );
      owner.set(file, name);
    }
  }
});

test('catalog: every declared dependency exists in the template', () => {
  for (const name of allNames()) {
    const d = descriptor(name);
    for (const dep of d.deps ?? []) {
      assert.ok(templatePkg.dependencies?.[dep], `${name}: no dep "${dep}"`);
    }
    for (const dep of d.devDeps ?? []) {
      assert.ok(
        templatePkg.devDependencies?.[dep],
        `${name}: no devDep "${dep}"`
      );
    }
    for (const dep of d.web?.deps ?? []) {
      assert.ok(
        templateWebPkg.dependencies?.[dep],
        `${name}: no web dep "${dep}"`
      );
    }
    for (const script of d.scripts ?? []) {
      assert.ok(
        templatePkg.scripts?.[script],
        `${name}: no script "${script}"`
      );
    }
  }
});

/** Template text files, with `cli/` excluded — it holds names as data. */
function templateTextFiles() {
  return walkText(repoRoot, [], [...NOT_WALKED, 'cli', '.history']);
}

test('catalog: every marker in the template names a real module', () => {
  const known = new Set([...allNames(), 'template']);

  for (const file of templateTextFiles()) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const name = trailingMarker(line);
      if (!name) continue;
      assert.ok(
        known.has(name),
        `${path.relative(repoRoot, file)}: "chassis:${name}" names no ` +
          `module — a typo here silently disables pruning for that line`
      );
    }
  }
});

test('catalog: no module name collides with non-marker code', () => {
  // The CLI drops any line *containing* `chassis:<declined>`, not only lines
  // ending with it. So a module named `routes` would silently delete
  // `Symbol('chassis:routes')` from src/core. Naming is the guard; this
  // asserts nobody removes it.
  const known = new Set([...allNames(), 'template']);

  for (const file of templateTextFiles()) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const marker = trailingMarker(line);
      for (const name of allMarkerLikeNames(line)) {
        if (name === marker) continue;
        assert.ok(
          !known.has(name),
          `${path.relative(repoRoot, file)}: "chassis:${name}" appears ` +
            `mid-line and matches a module name — declining that module ` +
            `would delete this line: ${line.trim()}`
        );
      }
    }
  }
});

test('catalog: every module is marked or has files of its own', () => {
  // A module with neither a marker in the template nor files to delete is
  // one the CLI cannot actually remove.
  const marked = new Set();
  for (const file of templateTextFiles()) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const name = trailingMarker(line);
      if (name) marked.add(name);
    }
  }
  for (const name of allNames()) {
    assert.ok(
      marked.has(name) || declaredPaths(descriptor(name)).length > 0,
      `${name} has no markers and no files — pruning it would be a no-op`
    );
  }
});

test('catalog: every auth provider file is claimed by exactly one provider', () => {
  // An unclaimed file in web/auth/providers ships with *every* provider —
  // and then imports a module the CLI deleted. This is the guard against
  // adding a provider file (or a test for one) and forgetting the catalog.
  const owner = new Map();
  for (const [name, variant] of Object.entries(GROUPS.auth.variants)) {
    for (const file of variant.web?.files ?? []) {
      const previous = owner.get(file);
      assert.ok(!previous, `${file} claimed by both ${previous} and ${name}`);
      owner.set(file, name);
    }
  }

  // The CLI removes these itself rather than through the catalog: the
  // `none` stubs when a real provider wins, and the template-only check.
  const handledDirectly = new Set([
    'web/auth/providers/none.tsx',
    'web/auth/providers/none.middleware.ts',
    'web/auth/providers/conformance.ts'
  ]);

  const dir = path.join(repoRoot, 'web', 'auth', 'providers');
  for (const entry of fs.readdirSync(dir)) {
    const rel = `web/auth/providers/${entry}`;
    assert.ok(
      owner.has(rel) || handledDirectly.has(rel),
      `${rel} belongs to no auth provider — it would ship with all of them`
    );
  }
});

test('catalog: presets reference real variants and every module', () => {
  const moduleKeys = Object.keys(MODULES).sort();
  for (const [name, preset] of Object.entries(PRESETS)) {
    assert.ok(GROUPS.db.variants[preset.db], `${name}: bad db "${preset.db}"`);
    assert.ok(
      GROUPS.auth.variants[preset.auth],
      `${name}: bad auth "${preset.auth}"`
    );
    assert.deepEqual(
      Object.keys(preset.modules).sort(),
      moduleKeys,
      `${name}: preset.modules must list every module exactly once`
    );
    assert.equal(typeof preset.docker, 'boolean', `${name}: docker flag`);
    assert.equal(typeof preset.label, 'string', `${name}: label`);
  }
});

test('catalog: the monorepo move list matches the template', () => {
  for (const rel of MONOREPO.apiPaths) {
    assert.ok(
      fs.existsSync(path.join(repoRoot, rel)),
      `MONOREPO.apiPaths lists "${rel}", which is not in the template`
    );
  }
  for (const dep of MONOREPO.rootDevDeps) {
    assert.ok(
      templatePkg.devDependencies?.[dep],
      `MONOREPO.rootDevDeps lists "${dep}", which the template does not have`
    );
  }
  for (const script of MONOREPO.rootScripts) {
    assert.ok(
      templatePkg.scripts?.[script],
      `MONOREPO.rootScripts lists "${script}", which the template does not have`
    );
  }
  // src must not be listed twice or the rename would throw on the second.
  assert.equal(
    MONOREPO.apiPaths.length,
    new Set(MONOREPO.apiPaths).size,
    'duplicate entry in MONOREPO.apiPaths'
  );
});

// ── CLI contract (bad input must fail loudly) ───────────────

/** Run the CLI expecting a non-zero exit; returns the process result. */
function scaffoldFailing(args) {
  return spawnSync('node', [cliPath, ...args, '--no-install', '--no-git'], {
    env: { ...process.env, CHASSIS_TEMPLATE: repoRoot },
    encoding: 'utf8'
  });
}

test('cli: rejects unknown choices instead of silently defaulting', () => {
  const cases = [
    { args: ['--db', 'mysql'], expect: /Invalid --db/ },
    { args: ['--auth', 'okta'], expect: /Invalid --auth/ },
    { args: ['--preset', 'turbo'], expect: /Invalid --preset/ }
  ];
  for (const { args, expect } of cases) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chassis-test-'));
    const res = scaffoldFailing([path.join(tmp, 'app'), '--yes', ...args]);
    assert.notEqual(res.status, 0, `[${args}] should have failed`);
    assert.match(res.stderr, expect);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('cli: refuses to scaffold into a non-empty directory', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chassis-test-'));
  const target = path.join(tmp, 'app');
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'keep-me.txt'), 'precious');

  try {
    const res = scaffoldFailing([target, '--bare']);
    assert.notEqual(res.status, 0, 'scaffolding over existing files succeeded');
    assert.match(res.stderr, /already exists and is not empty/);
    assert.equal(
      fs.readFileSync(path.join(target, 'keep-me.txt'), 'utf8'),
      'precious',
      'the CLI touched an existing file before bailing'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('cli: --help documents every preset, choice and toggle', () => {
  const res = spawnSync('node', [cliPath, '--help'], { encoding: 'utf8' });
  assert.equal(res.status, 0);

  for (const preset of Object.keys(PRESETS)) {
    assert.ok(res.stdout.includes(preset), `--help omits preset "${preset}"`);
  }
  for (const key of Object.keys(MODULES)) {
    assert.ok(res.stdout.includes(`--${key}`), `--help omits "--${key}"`);
  }
  for (const group of Object.values(GROUPS)) {
    for (const variant of Object.keys(group.variants)) {
      assert.ok(res.stdout.includes(variant), `--help omits "${variant}"`);
    }
  }
});

// ── Structural cases (fast, no install) ─────────────────────

const structural = [
  { label: 'bare (minimal)', flags: ['--bare'], kept: [] },
  { label: 'db mongo', flags: ['--preset', 'minimal', '--db', 'mongo'], kept: ['mongo'] }, // prettier-ignore
  { label: 'db postgres', flags: ['--preset', 'minimal', '--db', 'postgres'], kept: ['postgres'] }, // prettier-ignore
  { label: 'db sqlite', flags: ['--preset', 'minimal', '--db', 'sqlite'], kept: ['sqlite'] }, // prettier-ignore
  { label: 'auth auth0', flags: ['--preset', 'minimal', '--auth', 'auth0'], kept: ['auth0'] }, // prettier-ignore
  { label: 'auth jwt', flags: ['--preset', 'minimal', '--auth', 'jwt'], kept: ['jwt'] }, // prettier-ignore
  { label: 'auth clerk', flags: ['--preset', 'minimal', '--auth', 'clerk'], kept: ['clerk'] }, // prettier-ignore
  { label: 'toggle sentry', flags: ['--preset', 'minimal', '--sentry'], kept: ['sentry'] }, // prettier-ignore
  { label: 'toggle mcp', flags: ['--preset', 'minimal', '--mcp'], kept: ['mcp'] }, // prettier-ignore
  { label: 'toggle x402', flags: ['--preset', 'minimal', '--x402'], kept: ['x402'] }, // prettier-ignore
  { label: 'preset lite', flags: ['--preset', 'lite'], kept: ['sqlite', 'jwt'] }, // prettier-ignore
  { label: 'preset api', flags: ['--preset', 'api'], kept: ['postgres', 'jwt', 'sentry'] }, // prettier-ignore
  { label: '--yes (api default)', flags: ['--yes'], kept: ['postgres', 'jwt', 'sentry'] }, // prettier-ignore
  // Every auth provider, with and without the front end — the full matrix
  // the monorepo restructure has to survive.
  { label: 'web + auth none', flags: ['--preset', 'minimal', '--web'], kept: ['web'] }, // prettier-ignore
  { label: 'web + auth jwt', flags: ['--preset', 'minimal', '--web', '--auth', 'jwt'], kept: ['web', 'jwt'] }, // prettier-ignore
  { label: 'web + auth auth0', flags: ['--preset', 'minimal', '--web', '--auth', 'auth0'], kept: ['web', 'auth0'] }, // prettier-ignore
  { label: 'web + auth clerk', flags: ['--preset', 'minimal', '--web', '--auth', 'clerk'], kept: ['web', 'clerk'] }, // prettier-ignore
  { label: 'web + jwt + sqlite', flags: ['--preset', 'minimal', '--web', '--auth', 'jwt', '--db', 'sqlite'], kept: ['web', 'jwt', 'sqlite'] }, // prettier-ignore
  { label: 'preset fullstack', flags: ['--preset', 'fullstack'], kept: ['postgres', 'jwt', 'sentry', 'web'] } // prettier-ignore
];

for (const { label, flags, kept } of structural) {
  test(`structural: ${label}`, () => {
    const dir = scaffold(flags);
    try {
      assertScaffold(dir, kept);
    } finally {
      fs.rmSync(path.dirname(dir), { recursive: true, force: true });
    }
  });
}

// Shared-dep guard: drizzle-orm belongs to both postgres and sqlite; choosing
// one must not let declining the other strip it.
test('structural: shared dep (drizzle-orm) survives', () => {
  for (const db of ['postgres', 'sqlite']) {
    const dir = scaffold(['--preset', 'minimal', '--db', db]);
    try {
      const deps = Object.keys(readPkg(dir).dependencies ?? {});
      assert.ok(
        deps.includes('drizzle-orm'),
        `${db}: drizzle-orm was stripped`
      );
    } finally {
      fs.rmSync(path.dirname(dir), { recursive: true, force: true });
    }
  }
});

// The auth × db cross-product: the `users` table and its store belong to
// local JWT, not to the database. Choosing a database without `--auth jwt`
// must ship neither; choosing both must ship both.
test('structural: user store follows jwt, not the database', () => {
  for (const db of ['postgres', 'sqlite', 'mongo']) {
    for (const auth of ['clerk', 'jwt']) {
      const wantStore = auth === 'jwt';
      const dir = scaffold(['--preset', 'minimal', '--db', db, '--auth', auth]);
      try {
        assert.equal(
          fs.existsSync(path.join(dir, `src/db/${db}/users.ts`)),
          wantStore,
          `${db}/${auth}: user store presence`
        );
        const schema = path.join(dir, `src/db/${db}/schema.ts`);
        if (fs.existsSync(schema)) {
          const source = fs.readFileSync(schema, 'utf8');
          assert.equal(
            source.includes('users.schema'),
            wantStore,
            `${db}/${auth}: users table re-export presence`
          );
          // The table file and its re-export must come and go together.
          assert.equal(
            fs.existsSync(path.join(dir, `src/db/${db}/users.schema.ts`)),
            wantStore,
            `${db}/${auth}: users table file presence`
          );
        }
      } finally {
        fs.rmSync(path.dirname(dir), { recursive: true, force: true });
      }
    }
  }
});

// Pruning is only half a guarantee: the other half is that a kept module's
// lines survive verbatim. Without this, a marker regex that ate too much
// would still pass every "declined module is gone" assertion.
test('structural: kept modules keep every one of their marked lines', () => {
  const kept = ['postgres', 'jwt', 'sentry']; // the `api` preset
  const dir = scaffold(['--preset', 'api']);

  try {
    for (const file of templateTextFiles()) {
      const rel = path.relative(repoRoot, file);
      const scaffolded = path.join(dir, rel);
      if (!fs.existsSync(scaffolded)) continue;

      const after = fs.readFileSync(scaffolded, 'utf8');
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        const name = trailingMarker(line);
        if (!name || !kept.includes(name)) continue;

        // The CLI keeps the line and strips only the marker itself.
        const stripped = line
          .replace(/\s*(?:\/\/|#)?\s*chassis:\w+\s*$/, '')
          .trimEnd();
        if (!stripped.trim()) continue; // marker-only line: nothing to keep

        assert.ok(
          after.includes(stripped),
          `${rel}: kept module ${name} lost a line: ${stripped.trim()}`
        );
      }
    }
  } finally {
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  }
});

/** relative path -> content hash, for every file in the tree. */
function fingerprint(dir, base = dir, out = new Map()) {
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (NOT_WALKED.includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      fingerprint(full, base, out);
    } else {
      out.set(
        path.relative(base, full),
        createHash('sha256').update(fs.readFileSync(full)).digest('hex')
      );
    }
  }
  return out;
}

test('structural: the same flags always produce the same project', () => {
  const dirs = [scaffold(['--preset', 'fullstack']), scaffold(['--preset', 'fullstack'])]; // prettier-ignore

  try {
    const [a, b] = dirs.map((d) => fingerprint(d));
    assert.deepEqual(
      [...a.keys()].sort(),
      [...b.keys()].sort(),
      'two scaffolds produced different file lists'
    );
    for (const [file, hash] of a) {
      assert.equal(b.get(file), hash, `${file} differs between two scaffolds`);
    }
  } finally {
    for (const d of dirs) {
      fs.rmSync(path.dirname(d), { recursive: true, force: true });
    }
  }
});

// Presets encode the stacks documented in the CLI reference — pin them.
test('structural: preset stacks match PRESETS', () => {
  assert.deepEqual(PRESETS.api.db, 'postgres');
  assert.deepEqual(PRESETS.lite.db, 'sqlite');
  assert.deepEqual(PRESETS.minimal.db, 'none');
});

// ── Build cases (SCAFFOLD_BUILD=1): install + verify ────────

const build = [
  { label: 'bare', flags: ['--bare'], kept: [], db: null },
  { label: 'lite (sqlite/jwt)', flags: ['--preset', 'lite'], kept: ['sqlite', 'jwt'], db: 'sqlite' }, // prettier-ignore
  { label: 'api (postgres/jwt/sentry)', flags: ['--preset', 'api'], kept: ['postgres', 'jwt', 'sentry'], db: 'postgres' }, // prettier-ignore
  { label: 'mongo/clerk/sentry/mcp/x402', flags: ['--preset', 'minimal', '--db', 'mongo', '--auth', 'clerk', '--sentry', '--mcp', '--x402', '--docker'], kept: ['mongo', 'clerk', 'sentry', 'mcp', 'x402'], db: 'mongo' }, // prettier-ignore
  { label: 'postgres/auth0/mcp', flags: ['--preset', 'minimal', '--db', 'postgres', '--auth', 'auth0', '--mcp'], kept: ['postgres', 'auth0', 'mcp'], db: 'postgres' }, // prettier-ignore
  // Local JWT with no database at all: every db import in the user-store
  // seam prunes away, which is where an unused-import build break hides.
  { label: 'jwt, no database', flags: ['--preset', 'minimal', '--auth', 'jwt'], kept: ['jwt'], db: null }, // prettier-ignore
  { label: 'jwt, no database + web', flags: ['--preset', 'minimal', '--auth', 'jwt', '--web'], kept: ['jwt', 'web'], db: null }, // prettier-ignore
  // Monorepo layouts: each auth provider's web half must install and verify.
  { label: 'fullstack (sqlite/jwt/web)', flags: ['--preset', 'minimal', '--db', 'sqlite', '--auth', 'jwt', '--web'], kept: ['sqlite', 'jwt', 'web'], db: 'sqlite' }, // prettier-ignore
  { label: 'web + clerk', flags: ['--preset', 'minimal', '--auth', 'clerk', '--web'], kept: ['clerk', 'web'], db: null }, // prettier-ignore
  { label: 'web + auth0', flags: ['--preset', 'minimal', '--auth', 'auth0', '--web'], kept: ['auth0', 'web'], db: null }, // prettier-ignore
  { label: 'web + no auth', flags: ['--preset', 'minimal', '--web'], kept: ['web'], db: null } // prettier-ignore
];

for (const { label, flags, kept, db } of build) {
  test(
    `build: ${label}`,
    { skip: !process.env.SCAFFOLD_BUILD, timeout: 600_000 },
    () => {
      const dir = scaffold(flags);
      try {
        assertScaffold(dir, kept);

        const install = npm(['install', '--no-audit', '--no-fund'], dir);
        assert.equal(
          install.status,
          0,
          `npm install failed:\n${install.stderr}`
        );

        const verify = npm(['run', 'verify'], dir);
        assert.equal(verify.status, 0, `verify failed:\n${verify.stdout}\n${verify.stderr}`); // prettier-ignore

        // `build` catches what `verify` cannot: it compiles the API for
        // emit, and in a monorepo it runs `next build` — the only thing
        // that exercises middleware and edge bundling per auth provider.
        const build = npm(['run', 'build'], dir);
        assert.equal(build.status, 0, `build failed:\n${build.stdout}\n${build.stderr}`); // prettier-ignore

        // The DB-aware generator must produce code that still verifies.
        if (db) {
          const gen = npm(['run', 'gen', 'Thing'], dir);
          assert.equal(gen.status, 0, `gen failed:\n${gen.stderr}`);
          const reverify = npm(['run', 'verify'], dir);
          assert.equal(reverify.status, 0, `verify after gen failed:\n${reverify.stdout}\n${reverify.stderr}`); // prettier-ignore
        }
      } finally {
        fs.rmSync(path.dirname(dir), { recursive: true, force: true });
      }
    }
  );
}
