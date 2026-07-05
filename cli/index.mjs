#!/usr/bin/env node
/**
 * create-chassis — scaffold a Chassis backend.
 *
 *   npm create chassis my-api
 *   npx create-chassis my-api [--yes]
 *
 * Downloads the template, asks which modules you want (MongoDB, Auth0,
 * Sentry, Docker), and prunes everything you decline — the generated
 * project compiles and tests green with only what you chose.
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

const REPO = 'dvd90/node-ts-express-bp';
const TARBALL_URL = `https://codeload.github.com/${REPO}/tar.gz/HEAD`;

const MODULES = {
  mongo: {
    label: 'MongoDB (Mongoose)',
    files: ['src/integrations/mongo.ts'],
    deps: ['mongoose']
  },
  auth0: {
    label: 'Auth0 JWT auth',
    files: ['src/integrations/auth0.ts'],
    deps: ['express-oauth2-jwt-bearer']
  },
  sentry: {
    label: 'Sentry error reporting',
    files: ['src/integrations/sentry.ts'],
    deps: ['@sentry/node']
  }
};

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

const fail = (msg) => {
  console.error(red(`✖ ${msg}`));
  process.exit(1);
};

// ── Arguments & prompts ─────────────────────────────────────────────

const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('-')));
/** --bare: skip prompts and decline every optional module. */
const bare = flags.has('--bare');
const skipPrompts =
  bare || flags.has('--yes') || flags.has('-y') || !process.stdin.isTTY;

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

let targetDir = args[0] ?? (await ask('Project directory?', 'my-api'));
targetDir = path.resolve(targetDir);
const projectName = path
  .basename(targetDir)
  .toLowerCase()
  .replace(/[^a-z0-9-_]/g, '-');

if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
  fail(`${targetDir} already exists and is not empty`);
}

const chosen = {};
for (const [key, mod] of Object.entries(MODULES)) {
  chosen[key] = await confirm(`Include ${bold(mod.label)}?`, !bare);
}
const withDocker = await confirm(
  `Include ${bold('Docker')} (Dockerfile + compose)?`,
  !bare
);
const withGit = await confirm('Initialize a git repository?', true);
const withInstall = await confirm('Run npm install now?', !skipPrompts);

rl?.close();

// ── Fetch the template ──────────────────────────────────────────────

const IGNORE = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  'cli',
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

// ── Prune declined modules ──────────────────────────────────────────

const declined = Object.keys(MODULES).filter((key) => !chosen[key]);
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

const pkgPath = path.join(targetDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

for (const key of declined) {
  for (const file of MODULES[key].files) {
    fs.rmSync(path.join(targetDir, file), { force: true });
  }
  for (const dep of MODULES[key].deps) {
    delete pkg.dependencies[dep];
  }
}

if (!withDocker) {
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

// ── Finish up ───────────────────────────────────────────────────────

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

const enabled = Object.entries(chosen)
  .filter(([, on]) => on)
  .map(([key]) => MODULES[key].label);

console.log(`\n${green('✔')} Created ${bold(projectName)} at ${targetDir}`);
console.log(
  enabled.length
    ? `${green('✔')} Modules: ${enabled.join(', ')} ${dim('(enable via .env — see .env.example)')}`
    : `${green('✔')} Standalone build — no external services required`
);
console.log(`\nNext steps:\n`);
console.log(`  cd ${path.relative(process.cwd(), targetDir) || '.'}`);
if (!withInstall) console.log('  npm install');
console.log('  npm run dev');
console.log(
  `\n${dim('Docs: README.md · docs/architecture.md · docs/modules.md')}\n`
);
