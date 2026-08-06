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
import {
  MODULES,
  GROUPS,
  IMPLIED,
  PRESETS,
  MONOREPO,
  descriptor,
  impliedBy
} from './modules.mjs';

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

/**
 * Every module, group-variant and implied-module name (excluding the empty
 * `none`). Implied modules are never chosen directly, but they own files and
 * dependencies, so every oracle below has to know about them.
 */
function allNames() {
  const names = [...Object.keys(MODULES), ...Object.keys(IMPLIED)];
  for (const group of Object.values(GROUPS)) {
    for (const key of Object.keys(group.variants)) {
      if (key !== 'none') names.push(key);
    }
  }
  return names;
}

/** A selection plus everything it drags in. */
function expand(names) {
  return [...new Set(names.flatMap((name) => [name, ...impliedBy(name)]))];
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
  // Only the API's own paths move under apps/api. Everything else — docs,
  // README, .github — stays at the repo root, so a module that owns a doc
  // file must be looked for there.
  if (!MONOREPO.apiPaths.includes(file.split('/')[0])) {
    return path.join(dir, file);
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


/**
 * What a declined module must leave no trace of.
 *
 * The acceptance criterion for `--auth magic-only` is that the word "password"
 * appears nowhere in a generated project. Rather than special-casing that one
 * grep, every splittable module declares what its absence should look like —
 * so magic and session are held to the same standard.
 *
 * `everywhere` widens the scan to markdown. Only `password` sets it: docs
 * deliberately describe modules a project declined (that is why .md is exempt
 * from marker pruning), so the module-specific prose lives in module-owned doc
 * files that get deleted outright.
 */
const RESIDUE = {
  password: {
    pattern: /password/i,
    // The database's own credential, correctly kept, and nothing to do with
    // how people sign in.
    allow: /POSTGRES_PASSWORD/,
    everywhere: true
  },

  magic: { pattern: /\bmagic\b|mailpit|nodemailer/i },
  session: { pattern: /refreshToken|refresh_token|SESSION_ABSOLUTE/i }
};

/**
 * Two docs are exempt from the residue scan, for the same reason .md is exempt
 * from marker pruning: their subject *is* the module system, so naming a module
 * the reader did not scaffold is the job rather than a leak. Everything else,
 * prose included, is held to the rule.
 */
const SCAFFOLDER_DOCS = ['docs/modules.md', 'docs/reference/cli.md'];

function describesTheScaffolder(dir, file) {
  const rel = path.relative(dir, file).split(path.sep).join('/');
  return SCAFFOLDER_DOCS.includes(rel);
}

function assertNoModuleResidue(dir, declined) {
  for (const name of declined) {
    const rule = RESIDUE[name];
    if (!rule) continue;

    const files = rule.everywhere ? walkAll(dir) : walkText(dir, []);

    for (const file of files) {
      if (describesTheScaffolder(dir, file)) continue;
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      for (const [index, line] of lines.entries()) {
        if (!rule.pattern.test(line)) continue;
        if (rule.allow?.test(line)) continue;
        assert.fail(
          `declined module ${name} left a trace in ` +
            `${path.relative(dir, file)}:${index + 1}: ${line.trim()}`
        );
      }
    }
  }
}

/**
 * Every text file, markdown included. Lockfiles are skipped: they are full of
 * transitive package names nobody chose (`magic-string`, for one), and none of
 * it is residue from a pruned module.
 */
function walkAll(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    if (entry.name === 'package-lock.json') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkAll(full, out);
    else if (/\.(ts|tsx|mjs|yml|yaml|json|md|example)$/.test(entry.name)) {
      out.push(full);
    } else if (entry.name.startsWith('.env')) out.push(full);
  }
  return out;
}

/** The heart of the test: assert the scaffold carries exactly `keptNames`. */
function assertScaffold(dir, selected) {
  const keptNames = expand(selected);
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

  assertNoModuleResidue(dir, declined);

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
    'site',
    'mcp-server',
    // Declared by path rather than basename in .chassisignore — a generated
    // project has no site/, so this workflow would fail on its first push.
    '.github/workflows/docs.yml',
    '.chassisignore',
    '.history',
    'node_modules',
    'package-lock.json'
  ]) {
    assert.ok(!fs.existsSync(path.join(dir, gone)), `shipped ${gone}`);
  }

  // Docker has to point at wherever the API actually ended up.
  const compose = path.join(dir, 'docker-compose.yml');
  if (fs.existsSync(compose)) {
    const yaml = fs.readFileSync(compose, 'utf8');
    assert.match(
      yaml,
      monorepo ? /build: \.\/apps\/api/ : /build: \./,
      'compose build context does not match the layout'
    );
    const dockerfile = path.join(dir, monorepo ? MONOREPO.apiDir : '.', 'Dockerfile'); // prettier-ignore
    if (fs.existsSync(dockerfile)) {
      // A fresh scaffold has no lockfile — the CLI strips the template's — and
      // in a monorepo the workspace lockfile is outside this build context.
      // Either way an unconditional `npm ci` cannot work.
      assert.match(
        fs.readFileSync(dockerfile, 'utf8'),
        /if \[ -f package-lock\.json \]/,
        'Dockerfile must build with or without a lockfile'
      );
    }
  }

  // Every generated project carries its conventions in each agent's own
  // format — that is what keeps the code an agent writes idiomatic.
  for (const guide of [
    'AGENTS.md',
    'CLAUDE.md',
    'llms.txt',
    '.cursor/rules/chassis.mdc',
    '.github/copilot-instructions.md'
  ]) {
    assert.ok(fs.existsSync(path.join(dir, guide)), `missing ${guide}`);
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

/** Does this selection produce the apps/api + apps/web layout? */
function monorepoLayout(keptNames) {
  return keptNames.includes('web');
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
    // A variant that only composes implied modules owns no files and no
    // markers of its own — that is the whole point of `implies`.
    if (impliedBy(name).length) continue;
    assert.ok(
      marked.has(name) || declaredPaths(descriptor(name)).length > 0,
      `${name} has no markers and no files — pruning it would be a no-op`
    );
  }
});

test('catalog: no .tsx file carries a chassis: marker', () => {
  // The pruner does not read .tsx (cli/index.mjs), and neither does the
  // marker-residue grep in .github/workflows/published.yml. A marker there
  // would therefore survive into every generated project, silently. Rather
  // than teach two regexes about JSX — where Prettier moves comments around
  // and `{/* ... */}` does not match the end-of-line pattern anyway — markers
  // stay in .ts and this test keeps them there.
  const offenders = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (NOT_WALKED.includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.tsx')) {
        const source = fs.readFileSync(full, 'utf8');
        if (/chassis:\w+/.test(source)) {
          offenders.push(path.relative(repoRoot, full));
        }
      }
    }
  })(repoRoot);

  assert.deepEqual(
    offenders,
    [],
    'markers in .tsx are invisible to the pruner — move them to a .ts file'
  );
});

test('catalog: every implies target is a real module', () => {
  for (const name of allNames()) {
    for (const target of impliedBy(name)) {
      assert.ok(
        descriptor(target),
        `${name} implies "${target}", which no module declares`
      );
      assert.ok(
        IMPLIED[target],
        `${name} implies "${target}", which must live in IMPLIED so the ` +
          `interactive path never prompts for it`
      );
    }
  }
});

test('catalog: every implied module is reachable from some variant', () => {
  const reachable = new Set(allNames().flatMap((name) => impliedBy(name)));
  for (const name of Object.keys(IMPLIED)) {
    assert.ok(
      reachable.has(name),
      `IMPLIED.${name} is implied by nothing — it could never be scaffolded`
    );
  }
});

test('catalog: every auth provider file is claimed by exactly one provider', () => {
  // An unclaimed file in web/auth/providers ships with *every* provider —
  // and then imports a module the CLI deleted. This is the guard against
  // adding a provider file (or a test for one) and forgetting the catalog.
  const owner = new Map();
  const claimants = [
    ...Object.entries(GROUPS.auth.variants),
    ...Object.entries(IMPLIED)
  ];
  for (const [name, variant] of claimants) {
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

/** Repository-only paths the template declares for itself. */
function chassisIgnore() {
  const declared = new Set();
  for (const raw of fs
    .readFileSync(path.join(repoRoot, '.chassisignore'), 'utf8')
    .split('\n')) {
    const entry = raw.replace(/#.*$/, '').trim();
    if (entry) declared.add(entry);
  }
  return declared;
}

test('catalog: every committed top-level path is classified', () => {
  // The CLI is versioned separately from the template it downloads, so a
  // release from months ago still fetches today's master. A new top-level
  // directory therefore leaks into projects made by every already-published
  // version — which is exactly how `mcp-server/` shipped in 0.3.0. Matched
  // CLI+template tests cannot see that; this can.
  const tracked = spawnSync('git', ['ls-tree', '--name-only', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8'
  })
    .stdout.trim()
    .split('\n')
    .filter(Boolean);

  // Everything a generated project may legitimately contain. `web` is here
  // because it ships with --web and is pruned otherwise.
  const SHIPS = new Set([
    '.chassisignore',
    '.claude',
    '.cursor',
    '.dockerignore',
    '.env.example',
    '.github',
    '.gitignore',
    '.husky',
    '.prettierignore',
    '.prettierrc',
    '.vscode',
    'AGENTS.md',
    'CLAUDE.md',
    'Dockerfile',
    'LICENSE',
    'README.md',
    'docker-compose.yml',
    'docs',
    'eslint.config.mjs',
    'llms.txt',
    'package.json',
    'renovate.json',
    'scripts',
    'src',
    'tsconfig.build.json',
    'tsconfig.json',
    'vitest.config.ts',
    'web'
  ]);

  // Stripped by the CLI regardless of the template's declarations.
  const ALWAYS_STRIPPED = new Set(['package-lock.json']);

  const declared = chassisIgnore();
  for (const entry of tracked) {
    assert.ok(
      SHIPS.has(entry) || declared.has(entry) || ALWAYS_STRIPPED.has(entry),
      `"${entry}" is neither in this test's shipped list nor declared in ` +
        `.chassisignore — a new top-level path must be classified, or it ` +
        `leaks into projects made by already-published CLI versions`
    );
  }
});

test('catalog: .chassisignore covers the template-only siblings', () => {
  const declared = chassisIgnore();
  for (const entry of ['cli', 'site', 'mcp-server']) {
    assert.ok(
      declared.has(entry),
      `${entry} must be in .chassisignore, not only in the CLI's ignore list`
    );
  }
});

test('catalog: every module the CLI imports is actually published', () => {
  // npm ships only what `files` lists. A new local import that nobody added
  // there produces a CLI that works in this repo and crashes on npx with
  // ERR_MODULE_NOT_FOUND — invisible to every test that runs from source.
  const cliPkg = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'cli', 'package.json'), 'utf8')
  );
  const published = new Set(cliPkg.files ?? []);

  const seen = new Set();
  const queue = ['index.mjs'];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);

    const source = fs.readFileSync(path.join(repoRoot, 'cli', file), 'utf8');
    for (const [, spec] of source.matchAll(/from\s+'(\.\/[^']+)'/g)) {
      const target = spec.replace('./', '');
      assert.ok(
        published.has(target),
        `cli/${file} imports "${spec}" but cli/package.json "files" does not ` +
          `list it — the published package would crash on startup`
      );
      queue.push(target);
    }
  }

  // And nothing is listed that does not exist.
  for (const file of published) {
    assert.ok(
      fs.existsSync(path.join(repoRoot, 'cli', file)),
      `cli/package.json publishes "${file}", which does not exist`
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

// Presets and toggles. The db × auth × web matrix is generated exhaustively
// below rather than sampled here, so a combination cannot be missed.
const structural = [
  { label: 'bare (minimal)', flags: ['--bare'], kept: [] },
  { label: 'toggle sentry', flags: ['--preset', 'minimal', '--sentry'], kept: ['sentry'] }, // prettier-ignore
  { label: 'toggle mcp', flags: ['--preset', 'minimal', '--mcp'], kept: ['mcp'] }, // prettier-ignore
  { label: 'toggle x402', flags: ['--preset', 'minimal', '--x402'], kept: ['x402'] }, // prettier-ignore
  { label: 'every toggle at once', flags: ['--preset', 'minimal', '--db', 'postgres', '--auth', 'jwt', '--sentry', '--mcp', '--x402', '--web', '--docker'], kept: ['postgres', 'jwt', 'sentry', 'mcp', 'x402', 'web'] }, // prettier-ignore
  { label: 'preset lite', flags: ['--preset', 'lite'], kept: ['sqlite', 'jwt'] }, // prettier-ignore
  { label: 'preset api', flags: ['--preset', 'api'], kept: ['postgres', 'jwt', 'sentry'] }, // prettier-ignore
  { label: 'preset fullstack', flags: ['--preset', 'fullstack'], kept: ['postgres', 'jwt', 'sentry', 'web'] }, // prettier-ignore
  { label: '--yes (api default)', flags: ['--yes'], kept: ['postgres', 'jwt', 'sentry'] } // prettier-ignore
];

// The full db × auth × web matrix. Sampling this is how `--auth jwt --db none`
// shipped broken: the bug was in a combination, not in any single module.
for (const db of Object.keys(GROUPS.db.variants)) {
  for (const auth of Object.keys(GROUPS.auth.variants)) {
    for (const web of [false, true]) {
      structural.push({
        label: `matrix: db=${db} auth=${auth}${web ? ' +web' : ''}`,
        flags: [
          '--preset',
          'minimal',
          '--db',
          db,
          '--auth',
          auth,
          ...(web ? ['--web'] : [])
        ],
        kept: [
          ...(db === 'none' ? [] : [db]),
          ...(auth === 'none' ? [] : [auth]),
          ...(web ? ['web'] : [])
        ]
      });
    }
  }
}

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

test('structural: the shipped CI workflow follows the magic module', () => {
  // A whole workflow job is marked line-by-line, which is the largest marked
  // block in the template — exactly the kind of thing that half-prunes and
  // leaves invalid YAML behind.
  const withMagic = scaffold(['--preset', 'minimal', '--auth', 'magic-only']);
  const withoutMagic = scaffold(['--preset', 'minimal', '--auth', 'jwt']);

  try {
    const ci = (dir) =>
      fs.readFileSync(path.join(dir, '.github/workflows/ci.yml'), 'utf8');

    assert.match(ci(withMagic), /mail-e2e:/);
    assert.match(ci(withMagic), /axllent\/mailpit/);
    assert.doesNotMatch(ci(withoutMagic), /mail-e2e:/);
    assert.doesNotMatch(ci(withoutMagic), /mailpit/);

    // ...and what survives is still a single well-formed job list.
    assert.match(ci(withoutMagic), /^jobs:$/m);
    assert.match(ci(withoutMagic), /^ {2}scaffold:$/m);
  } finally {
    for (const dir of [withMagic, withoutMagic]) {
      fs.rmSync(path.dirname(dir), { recursive: true, force: true });
    }
  }
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
  { label: 'web + no auth', flags: ['--preset', 'minimal', '--web'], kept: ['web'], db: null }, // prettier-ignore
  // The two new local variants. magic-only is the one that has to compile with
  // every password reference pruned; password+magic is the one where both
  // halves share a session layer.
  { label: 'magic-only (postgres)', flags: ['--preset', 'minimal', '--db', 'postgres', '--auth', 'magic-only'], kept: ['postgres', 'magic-only'], db: 'postgres' }, // prettier-ignore
  { label: 'password+magic (sqlite)', flags: ['--preset', 'minimal', '--db', 'sqlite', '--auth', 'password+magic'], kept: ['sqlite', 'password+magic'], db: 'sqlite' }, // prettier-ignore
  { label: 'magic-only, no database + web', flags: ['--preset', 'minimal', '--auth', 'magic-only', '--web'], kept: ['magic-only', 'web'], db: null } // prettier-ignore
];

for (const [buildIndex, { label, flags, kept, db }] of build.entries()) {
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

        // Compiling is not running. Nothing above would notice a scaffold
        // that builds cleanly and then dies on boot — a bad import order, a
        // config schema that rejects its own defaults, a missing dist file.
        const port = 8100 + buildIndex;
        const apiDir = path.join(dir, monorepoLayout(kept) ? MONOREPO.apiDir : ''); // prettier-ignore
        const boot = spawnSync(
          'bash',
          [
            '-c',
            `cd "${apiDir}" && PORT=${port} node dist/server.js >boot.log 2>&1 &
             pid=$!
             ok=0
             for _ in $(seq 1 80); do
               if curl -sf "http://127.0.0.1:${port}/status" >/dev/null; then ok=1; break; fi
               sleep 0.25
             done
             kill $pid 2>/dev/null
             if [ $ok -ne 1 ]; then cat boot.log; exit 1; fi`
          ],
          { encoding: 'utf8', timeout: 90_000 }
        );
        assert.equal(
          boot.status,
          0,
          `the built server never answered /status:\n${boot.stdout}\n${boot.stderr}`
        );

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
