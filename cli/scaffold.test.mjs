/**
 * Integration test for create-chassis pruning.
 *
 *   node --test cli/scaffold.test.mjs                  # structural only (fast)
 *   SCAFFOLD_BUILD=1 node --test cli/scaffold.test.mjs # + install & verify
 *
 * Two layers:
 *   - STRUCTURAL (always): scaffold every variant and assert the result carries
 *     exactly the right deps/files and no leftover `chassis:` markers — the
 *     "ships only what you chose, no useless packages or files" guarantee.
 *   - BUILD (SCAFFOLD_BUILD=1): npm install + `npm run verify` on a handful of
 *     representative projects that together exercise every DB, auth and toggle,
 *     plus the DB-aware generator.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MODULES, GROUPS, PRESETS, descriptor } from './modules.mjs';

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

function walkText(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', 'coverage'].includes(entry.name)) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkText(full, out);
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
  const pkg = readPkg(dir);
  const declined = allNames().filter((n) => !keptNames.includes(n));

  // 1 & 2. Dependencies/devDependencies are exactly base + kept modules.
  const deps = new Set(BASE_DEPS);
  const devDeps = new Set(BASE_DEV_DEPS);
  for (const name of keptNames) {
    const d = descriptor(name);
    for (const dep of d.deps ?? []) deps.add(dep);
    for (const dep of d.devDeps ?? []) devDeps.add(dep);
  }
  assertSameSet(Object.keys(pkg.dependencies ?? {}), deps, 'dependencies');
  assertSameSet(
    Object.keys(pkg.devDependencies ?? {}),
    devDeps,
    'devDependencies'
  );

  // 3. Kept modules' files exist; declined modules' files are gone.
  for (const name of keptNames) {
    for (const file of descriptor(name).files ?? []) {
      assert.ok(
        fs.existsSync(path.join(dir, file)),
        `kept module ${name}: missing file ${file}`
      );
    }
  }
  for (const name of declined) {
    for (const file of descriptor(name).files ?? []) {
      assert.ok(
        !fs.existsSync(path.join(dir, file)),
        `declined module ${name}: leftover file ${file}`
      );
    }
  }

  // 4. No marker for any declined module survives in any text file.
  const content = walkText(dir)
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n');
  for (const name of declined) {
    assert.ok(
      !content.includes(`chassis:${name}`),
      `leftover chassis:${name} marker`
    );
  }

  // 5. The `mcp` npm script exists iff MCP was kept.
  assert.equal(
    Boolean(pkg.scripts?.mcp),
    keptNames.includes('mcp'),
    'scripts.mcp presence'
  );
}

function npm(args, dir) {
  return spawnSync('npm', args, { cwd: dir, encoding: 'utf8' });
}

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
  { label: '--yes (api default)', flags: ['--yes'], kept: ['postgres', 'jwt', 'sentry'] } // prettier-ignore
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
  { label: 'postgres/auth0/mcp', flags: ['--preset', 'minimal', '--db', 'postgres', '--auth', 'auth0', '--mcp'], kept: ['postgres', 'auth0', 'mcp'], db: 'postgres' } // prettier-ignore
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
