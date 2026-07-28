#!/usr/bin/env node
/**
 * create-chassis — scaffold a Chassis backend.
 *
 *   npm create chassis my-api
 *   npx create-chassis my-api [--preset lite] [--yes]
 *
 * Pick a preset (or Custom to choose each module), and the CLI prunes
 * everything you didn't pick — the generated project compiles and tests
 * green with only what you chose, and its package.json carries only the
 * dependencies those modules need.
 *
 * Template source: the GitHub repo tarball, or a local checkout when
 * CHASSIS_TEMPLATE=/path/to/template is set (used for development).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline/promises';
import { MODULES, GROUPS, PRESETS, MONOREPO, descriptor } from './modules.mjs';

const REPO = 'dvd90/chassis';
const TARBALL_URL = `https://codeload.github.com/${REPO}/tar.gz/HEAD`;

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

const fail = (msg) => {
  console.error(red(`✖ ${msg}`));
  process.exit(1);
};

// ── Arguments & flags ───────────────────────────────────────

const rawArgs = process.argv.slice(2);
const positionals = [];
const flags = new Map(); // name -> value (true for boolean flags)

for (let i = 0; i < rawArgs.length; i++) {
  const arg = rawArgs[i];
  if (!arg.startsWith('-')) {
    positionals.push(arg);
    continue;
  }
  const [name, inlineValue] = arg.replace(/^--?/, '').split('=');
  // Value flags take the next token; boolean flags are just present.
  if (['preset', 'db', 'auth'].includes(name)) {
    flags.set(name, inlineValue ?? rawArgs[++i]);
  } else {
    flags.set(name, inlineValue ?? true);
  }
}

if (flags.has('help') || flags.has('h')) {
  printHelp();
  process.exit(0);
}

const bare = flags.has('bare');
const skipPrompts =
  bare || flags.has('yes') || flags.has('y') || !process.stdin.isTTY;

function printHelp() {
  const variants = (g) => Object.keys(GROUPS[g].variants).join(' | ');
  console.log(`
${bold('create-chassis')} — scaffold an Express + TypeScript backend.

${bold('Usage')}
  npm create chassis <dir> [options]

${bold('Presets')} (--preset <name>)
${Object.entries(PRESETS)
  .map(([k, p]) => `  ${k.padEnd(9)} ${p.label}`)
  .join('\n')}

${bold('Choices')}
  --db <name>      ${variants('db')}
  --auth <name>    ${variants('auth')}

${bold('Toggles')}
${Object.entries(MODULES)
  .map(([k, m]) => `  --${k.padEnd(13)} ${m.label}`)
  .join('\n')}
  --docker         Dockerfile + compose

${bold('Other')}
  --yes, -y        Accept defaults (Recommended API preset), no prompts
  --bare           Minimal preset, decline everything, no prompts
  --no-install     Skip npm install
  --no-git         Skip git init
  -h, --help       Show this help
`);
}

console.log(
  `\n${bold('🏎️  create-chassis')} — Express + TypeScript, ready to drive\n`
);

const rl = skipPrompts
  ? null
  : readline.createInterface({ input: process.stdin, output: process.stdout });

async function ask(question, fallback) {
  if (!rl) return fallback;
  const answer = (
    await rl.question(`${question} ${dim(`(${fallback})`)} `)
  ).trim();
  return answer || fallback;
}

async function confirm(question, fallback = true) {
  if (!rl) return fallback;
  const hint = fallback ? 'Y/n' : 'y/N';
  const answer = (await rl.question(`${question} ${dim(`(${hint})`)} `))
    .trim()
    .toLowerCase();
  if (!answer) return fallback;
  return answer.startsWith('y');
}

/** Numbered single-choice menu. `options` is [{ key, label }]. */
async function choose(prompt, options, fallback) {
  if (!rl) return fallback;
  console.log(`\n${bold(prompt)}`);
  options.forEach((o, i) => {
    const marker = o.key === fallback ? dim(' [default]') : '';
    console.log(`  ${i + 1}) ${o.label}${marker}`);
  });
  const fallbackIndex = options.findIndex((o) => o.key === fallback) + 1;
  const answer = (
    await rl.question(
      `Choose [1-${options.length}] ${dim(`(${fallbackIndex})`)} `
    )
  ).trim();
  if (!answer) return fallback;
  return options[Number(answer) - 1]?.key ?? fallback;
}

// ── Resolve the selection ───────────────────────────────────

/** Validate a flag value against the allowed set, or fail helpfully. */
function validateChoice(flag, group) {
  const value = flags.get(flag);
  if (value === undefined) return undefined;
  if (!GROUPS[group].variants[value]) {
    fail(
      `Invalid --${flag} "${value}". Choose one of: ${Object.keys(
        GROUPS[group].variants
      ).join(', ')}`
    );
  }
  return value;
}

function presetSelection(name) {
  const preset = PRESETS[name] ?? PRESETS.api;
  return {
    db: preset.db,
    auth: preset.auth,
    modules: { ...preset.modules },
    docker: preset.docker
  };
}

let targetDir = positionals[0] ?? (await ask('Project directory?', 'my-api'));
targetDir = path.resolve(targetDir);
const projectName = path
  .basename(targetDir)
  .toLowerCase()
  .replace(/[^a-z0-9-_]/g, '-');

if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
  fail(`${targetDir} already exists and is not empty`);
}

const presetFlag = flags.get('preset');
if (presetFlag && !PRESETS[presetFlag]) {
  fail(
    `Invalid --preset "${presetFlag}". Choose one of: ${Object.keys(
      PRESETS
    ).join(', ')}`
  );
}

let sel;
if (bare) {
  sel = presetSelection('minimal');
} else if (skipPrompts) {
  sel = presetSelection(presetFlag ?? 'api');
} else {
  const preset = await choose(
    'Choose a preset:',
    [
      ...Object.entries(PRESETS).map(([key, p]) => ({ key, label: p.label })),
      { key: 'custom', label: 'Custom — pick each module' }
    ],
    presetFlag ?? 'api'
  );
  if (preset === 'custom') {
    const dbChoice = await choose(
      GROUPS.db.prompt,
      Object.entries(GROUPS.db.variants).map(([key, v]) => ({
        key,
        label: v.label
      })),
      GROUPS.db.default
    );
    const authChoice = await choose(
      GROUPS.auth.prompt,
      Object.entries(GROUPS.auth.variants).map(([key, v]) => ({
        key,
        label: v.label
      })),
      GROUPS.auth.default
    );
    const modules = {};
    for (const [key, mod] of Object.entries(MODULES)) {
      modules[key] = await confirm(`Include ${bold(mod.label)}?`, false);
    }
    sel = {
      db: dbChoice,
      auth: authChoice,
      modules,
      docker: await confirm(
        `Include ${bold('Docker')} (Dockerfile + compose)?`,
        false
      )
    };
  } else {
    sel = presetSelection(preset);
  }
}

// Explicit flags always win over preset/prompt.
sel.db = validateChoice('db', 'db') ?? sel.db;
sel.auth = validateChoice('auth', 'auth') ?? sel.auth;
for (const key of Object.keys(MODULES)) {
  if (flags.has(key)) sel.modules[key] = flags.get(key) !== false;
}
if (flags.has('docker')) sel.docker = true;
if (flags.has('no-docker')) sel.docker = false;

const withGit = flags.has('no-git')
  ? false
  : await confirm('Initialize a git repository?', true);
const withInstall = flags.has('no-install')
  ? false
  : skipPrompts
    ? false
    : await confirm('Run npm install now?', true);

// Confirmation summary before writing anything.
const enabledNames = [
  ...(sel.db !== 'none' ? [GROUPS.db.variants[sel.db].label] : []),
  ...(sel.auth !== 'none' ? [GROUPS.auth.variants[sel.auth].label] : []),
  ...Object.entries(sel.modules)
    .filter(([, on]) => on)
    .map(([key]) => MODULES[key].label)
];
console.log(
  `\n${bold('Stack')}: ${enabledNames.length ? enabledNames.join(' · ') : 'standalone (no modules)'}${sel.docker ? dim(' · Docker') : ''}`
);
if (rl && !(await confirm('Create this project?', true))) {
  rl.close();
  fail('Aborted.');
}

rl?.close();

// ── Fetch the template ─────────────────────────────────────

const IGNORE = new Set([
  'node_modules',
  '.git',
  '.next',
  '.history', // VS Code local history — never part of the template
  'dist',
  'coverage',
  'cli',
  // Template-only siblings of cli/. Matched by basename, so these names must
  // not collide with anything inside the template — `mcp` would have taken
  // `src/mcp` with it, which is why the directory is `mcp-server`.
  'site',
  'mcp-server',
  'package-lock.json'
]);

function copyTemplate(src, dest) {
  fs.cpSync(src, dest, {
    recursive: true,
    filter: (from) => !IGNORE.has(path.basename(from))
  });
}

async function fetchTemplate(dest) {
  const local = process.env.CHASSIS_TEMPLATE;
  if (local) {
    console.log(dim(`\nUsing local template: ${local}`));
    copyTemplate(path.resolve(local), dest);
    return;
  }

  console.log(dim(`\nDownloading template from github.com/${REPO}...`));
  const res = await fetch(TARBALL_URL);
  if (!res.ok) fail(`Failed to download template (HTTP ${res.status})`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chassis-'));
  const tarPath = path.join(tmp, 'template.tar.gz');
  fs.writeFileSync(tarPath, Buffer.from(await res.arrayBuffer()));

  const extractDir = path.join(tmp, 'extract');
  fs.mkdirSync(extractDir);
  const tar = spawnSync('tar', ['-xzf', tarPath, '-C', extractDir]);
  if (tar.status !== 0)
    fail('Failed to extract template (is `tar` available?)');

  const [root] = fs.readdirSync(extractDir);
  copyTemplate(path.join(extractDir, root), dest);
  fs.rmSync(tmp, { recursive: true, force: true });
}

await fetchTemplate(targetDir);

// ── Prune everything not chosen ────────────────────────────

// Kept = chosen db/auth variants + enabled toggles. Declined = the rest.
const kept = [
  ...(sel.db !== 'none' ? [sel.db] : []),
  ...(sel.auth !== 'none' ? [sel.auth] : []),
  ...Object.entries(sel.modules)
    .filter(([, on]) => on)
    .map(([key]) => key)
];

// `chassis:template` marks lines that exist only to keep the Chassis repo
// itself building — they are never part of a generated project.
const declined = ['template'];
for (const group of Object.values(GROUPS)) {
  for (const key of Object.keys(group.variants)) {
    if (key !== 'none' && !kept.includes(key)) declined.push(key);
  }
}
for (const [key, on] of Object.entries(sel.modules)) {
  if (!on) declined.push(key);
}

// 1. Strip marked lines for declined modules across text files.
const MARKER_LINE = /\s*(?:\/\/|#)?\s*chassis:\w+\s*$/;

function walkTextFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORE.has(entry.name)) walkTextFiles(full, out);
      // .md files are skipped on purpose: the docs describe the full
      // module system, including parts the user declined.
    } else if (
      /\.(ts|mjs|yml|yaml|json|example)$/.test(entry.name) ||
      entry.name === '.env.example'
    ) {
      out.push(full);
    }
  }
  return out;
}

for (const file of walkTextFiles(targetDir)) {
  const original = fs.readFileSync(file, 'utf8');
  const pruned = original
    .split('\n')
    .filter((line) => !declined.some((mod) => line.includes(`chassis:${mod}`)))
    .map((line) => line.replace(MARKER_LINE, ''))
    .join('\n');
  if (pruned !== original) fs.writeFileSync(file, pruned);
}

// 2. Remove declined files/dirs, deps, devDeps and scripts — but never a
//    dependency a KEPT module still needs (e.g. drizzle-orm is shared by
//    postgres and sqlite).
const pkgPath = path.join(targetDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

/**
 * Delete an npm script and unchain it from any script that runs it, so
 * dropping a module never leaves `npm run verify` calling something that
 * no longer exists.
 */
function removeScript(target, script) {
  delete target.scripts?.[script];
  for (const [name, body] of Object.entries(target.scripts ?? {})) {
    target.scripts[name] = body.replace(
      new RegExp(`\\s*&&\\s*npm run ${script}(?![\\w:-])`),
      ''
    );
  }
}

const keptDeps = new Set();
const keptDevDeps = new Set();
for (const name of kept) {
  const d = descriptor(name);
  if (!d) continue;
  for (const dep of d.deps ?? []) keptDeps.add(dep);
  for (const dep of d.devDeps ?? []) keptDevDeps.add(dep);
}

for (const name of declined) {
  const d = descriptor(name);
  if (!d) continue;
  for (const file of [...(d.files ?? []), ...(d.crossFiles ?? [])]) {
    fs.rmSync(path.join(targetDir, file), { recursive: true, force: true });
  }
  for (const dep of d.deps ?? []) {
    if (!keptDeps.has(dep)) delete pkg.dependencies?.[dep];
  }
  for (const dep of d.devDeps ?? []) {
    if (!keptDevDeps.has(dep)) delete pkg.devDependencies?.[dep];
  }
  for (const script of d.scripts ?? []) removeScript(pkg, script);
}

if (!sel.docker) {
  for (const file of ['Dockerfile', 'docker-compose.yml', '.dockerignore']) {
    fs.rmSync(path.join(targetDir, file), { force: true });
  }
}

pkg.name = projectName;
pkg.version = '0.1.0';
pkg.description = '';
delete pkg.repository;
delete pkg.homepage;
pkg.author = '';
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// Strip template-specific artifacts so the generated project is the
// user's own, not a copy of Chassis:
//   - maintainers.md documents publishing Chassis itself — irrelevant here
//   - the LICENSE must credit the new project, not the template author
fs.rmSync(path.join(targetDir, 'docs', 'maintainers.md'), { force: true });

// Remove links to the deleted guide so the scaffold has no dead links.
const docsIndex = path.join(targetDir, 'docs', 'README.md');
if (fs.existsSync(docsIndex)) {
  const patched = fs
    .readFileSync(docsIndex, 'utf8')
    .replace(/\n## For maintainers[\s\S]*$/, '\n');
  fs.writeFileSync(docsIndex, patched);
}
const rootReadme = path.join(targetDir, 'README.md');
if (fs.existsSync(rootReadme)) {
  const patched = fs
    .readFileSync(rootReadme, 'utf8')
    .split('\n')
    .filter((line) => !line.includes('docs/maintainers.md'))
    .join('\n');
  fs.writeFileSync(rootReadme, patched);
}

const licensePath = path.join(targetDir, 'LICENSE');
if (fs.existsSync(licensePath)) {
  const year = new Date().getFullYear();
  const license = fs
    .readFileSync(licensePath, 'utf8')
    .replace(/Copyright \(c\) .*/, `Copyright (c) ${year} ${projectName}`);
  fs.writeFileSync(licensePath, license);
}

// ── Web front end: select the auth provider, then restructure ───

/**
 * Without `--web` the layout is untouched: a single package, exactly as the
 * template ships. With it, the API moves under apps/api, the Next.js app
 * under apps/web, and the root package.json becomes an npm workspaces root.
 */
function selectWebAuthProvider(webDir) {
  const provider = GROUPS.auth.variants[sel.auth]?.web?.provider ?? 'none';

  // The whole provider switch is these two re-export lines — see
  // web/auth/active.ts. Nothing else in the app names a provider.
  for (const file of ['auth/active.ts', 'auth/active-middleware.ts']) {
    const full = path.join(webDir, file);
    const source = fs.readFileSync(full, 'utf8');
    fs.writeFileSync(
      full,
      source.replaceAll("'./providers/none", `'./providers/${provider}`)
    );
  }

  // Declined providers' web files, then the `none` stubs if a real provider
  // took over, then the template-only conformance check.
  for (const name of declined) {
    for (const file of descriptor(name)?.web?.files ?? []) {
      fs.rmSync(path.join(targetDir, file), { recursive: true, force: true });
    }
  }
  if (provider !== 'none') {
    for (const stub of ['none.tsx', 'none.middleware.ts']) {
      fs.rmSync(path.join(webDir, 'auth/providers', stub), { force: true });
    }
  }
  for (const file of ['auth/providers/conformance.ts', 'auth/types.ts']) {
    fs.rmSync(path.join(webDir, file), { force: true });
  }

  const webPkgPath = path.join(webDir, 'package.json');
  const webPkg = JSON.parse(fs.readFileSync(webPkgPath, 'utf8'));
  for (const name of declined) {
    for (const dep of descriptor(name)?.web?.deps ?? []) {
      delete webPkg.dependencies?.[dep];
    }
  }
  webPkg.name = `${projectName}-web`;
  webPkg.version = '0.1.0';
  webPkg.description = '';
  fs.writeFileSync(webPkgPath, JSON.stringify(webPkg, null, 2) + '\n');
}

/** Hoist the single-package layout into apps/api + apps/web. */
function restructureToMonorepo(webDir) {
  const apiDir = path.join(targetDir, MONOREPO.apiDir);
  fs.mkdirSync(apiDir, { recursive: true });
  for (const rel of MONOREPO.apiPaths) {
    const from = path.join(targetDir, rel);
    if (fs.existsSync(from)) fs.renameSync(from, path.join(apiDir, rel));
  }

  const target = path.join(targetDir, MONOREPO.webDir);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.renameSync(webDir, target);

  // package.json splits three ways: repo-wide concerns stay at the root,
  // everything else follows the code it belongs to.
  const apiPkg = JSON.parse(JSON.stringify(pkg));
  apiPkg.name = `${projectName}-api`;
  apiPkg.private = true;
  for (const script of MONOREPO.rootScripts) delete apiPkg.scripts?.[script];
  // The single-package layout drives the web app from the API's scripts;
  // the workspaces root owns that now, so apps/api keeps only its own.
  for (const script of MODULES.web.scripts ?? []) removeScript(apiPkg, script);
  for (const dep of MONOREPO.rootDevDeps) delete apiPkg.devDependencies?.[dep];
  fs.writeFileSync(
    path.join(apiDir, 'package.json'),
    JSON.stringify(apiPkg, null, 2) + '\n'
  );

  const rootDevDeps = {};
  for (const dep of MONOREPO.rootDevDeps) {
    if (pkg.devDependencies?.[dep]) rootDevDeps[dep] = pkg.devDependencies[dep];
  }
  fs.writeFileSync(
    pkgPath,
    JSON.stringify(
      {
        name: projectName,
        version: '0.1.0',
        private: true,
        workspaces: [MONOREPO.apiDir, MONOREPO.webDir],
        engines: pkg.engines,
        scripts: {
          // `wait` keeps Ctrl-C killing both dev servers, not just the shell.
          dev: `npm run dev -w ${MONOREPO.apiDir} & npm run dev -w ${MONOREPO.webDir} & wait`,
          build: 'npm run build --workspaces --if-present',
          verify: 'npm run verify --workspaces --if-present',
          gen: `npm run gen -w ${MONOREPO.apiDir} --`,
          format: 'prettier --write .',
          prepare: 'husky || true'
        },
        devDependencies: rootDevDeps
      },
      null,
      2
    ) + '\n'
  );

  // Docker builds from apps/api, which has no lockfile of its own — the
  // workspace lockfile lives at the repo root.
  const dockerfile = path.join(apiDir, 'Dockerfile');
  if (fs.existsSync(dockerfile)) {
    fs.writeFileSync(
      dockerfile,
      fs
        .readFileSync(dockerfile, 'utf8')
        .replace('npm ci --ignore-scripts', 'npm install --ignore-scripts')
    );
  }
  const compose = path.join(targetDir, 'docker-compose.yml');
  if (fs.existsSync(compose)) {
    fs.writeFileSync(
      compose,
      fs
        .readFileSync(compose, 'utf8')
        .replace(/^(\s*)build: \.$/m, `$1build: ./${MONOREPO.apiDir}`)
    );
  }

  // The docs describe the single-package layout; say once, up front, how to
  // read them here rather than rewriting every path in every guide.
  const note =
    `> **Layout:** this project is an npm-workspaces monorepo. The API lives\n` +
    `> in \`${MONOREPO.apiDir}/\` — read every \`src/...\` path below as\n` +
    `> \`${MONOREPO.apiDir}/src/...\`. The Next.js front end is in \`${MONOREPO.webDir}/\`.\n\n`;
  for (const doc of [
    'AGENTS.md',
    'CLAUDE.md',
    'README.md',
    '.cursor/rules/chassis.mdc',
    '.github/copilot-instructions.md'
  ]) {
    const full = path.join(targetDir, doc);
    if (!fs.existsSync(full)) continue;
    const body = fs.readFileSync(full, 'utf8');
    const firstBreak = body.indexOf('\n\n');
    fs.writeFileSync(
      full,
      firstBreak === -1
        ? note + body
        : body.slice(0, firstBreak + 2) + note + body.slice(firstBreak + 2)
    );
  }
}

const webDir = path.join(targetDir, 'web');
if (sel.modules.web) {
  selectWebAuthProvider(webDir);
  restructureToMonorepo(webDir);
}

// ── Finish up ──────────────────────────────────────────

const run = (cmd, cmdArgs, opts = {}) =>
  spawnSync(cmd, cmdArgs, { cwd: targetDir, stdio: 'inherit', ...opts });

if (withGit) {
  const init = run('git', ['init', '-b', 'main'], { stdio: 'ignore' });
  if (init.status === 0) {
    run('git', ['add', '-A'], { stdio: 'ignore' });
    run('git', ['commit', '-m', 'Initial commit from create-chassis'], {
      stdio: 'ignore'
    });
  }
}

if (withInstall) {
  console.log(dim('\nInstalling dependencies...\n'));
  run('npm', ['install']);
}

console.log(`\n${green('✔')} Created ${bold(projectName)} at ${targetDir}`);
console.log(
  enabledNames.length
    ? `${green('✔')} Modules: ${enabledNames.join(', ')} ${dim('(enable via .env — see .env.example)')}`
    : `${green('✔')} Standalone build — no external services required`
);
console.log(
  `${green('✔')} AI-agent ready ${dim('(AGENTS.md, CLAUDE.md, Cursor + Copilot rules, llms.txt, add-resource skill)')}`
);

console.log(`\nNext steps:\n`);
console.log(`  cd ${path.relative(process.cwd(), targetDir) || '.'}`);
if (!withInstall) console.log('  npm install');
if (sel.docker && (sel.db === 'mongo' || sel.db === 'postgres')) {
  console.log('  docker compose up -d   # start the database');
}
const srcRoot = sel.modules.web ? `${MONOREPO.apiDir}/src` : 'src';
if (sel.db === 'postgres' || sel.db === 'sqlite') {
  console.log(
    `  npx drizzle-kit generate --config ${srcRoot}/db/${sel.db}/drizzle.config.ts`
  );
}
if (sel.modules.web) {
  console.log('  npm run dev            # API on :8000, web on :3000');
} else {
  console.log('  npm run dev');
}
if (sel.modules.mcp) {
  const workspace = sel.modules.web ? ` -w ${MONOREPO.apiDir}` : '';
  console.log(`  npm run mcp${workspace}            # MCP server (stdio)`);
}
console.log(`\n${dim('Docs: README.md · AGENTS.md · docs/README.md')}\n`);
