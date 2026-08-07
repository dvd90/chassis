/**
 * Drives chassis-mcp the way an agent does — over stdio, through the MCP
 * client — rather than calling the handlers directly. A tool that works in
 * isolation but fails to serialize, or advertises a stack the CLI rejects,
 * is exactly the bug this catches.
 *
 *   node --test mcp/server.test.mjs
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const mcpDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(mcpDir, '..');

let client;
const tmpDirs = [];

/** A fresh temp directory that is cleaned up after the run. */
function tmp(name = 'app') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chassis-mcp-'));
  tmpDirs.push(dir);
  return path.join(dir, name);
}

/** Call a tool and parse its JSON payload. */
async function call(name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  const body = res.content.map((c) => c.text).join('');
  return { res, body, json: () => JSON.parse(body) };
}

before(async () => {
  client = new Client({ name: 'chassis-mcp-test', version: '1.0.0' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [path.join(mcpDir, 'index.mjs')],
      env: {
        ...process.env,
        // Test the CLI in this checkout, not whatever npm resolved.
        CHASSIS_CLI: path.join(repoRoot, 'cli', 'index.mjs'),
        CHASSIS_TEMPLATE: repoRoot
      }
    })
  );
});

after(async () => {
  await client?.close();
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

test('advertises exactly the three tools an agent needs', async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [
    'chassis_conventions',
    'create_chassis_project',
    'list_chassis_options'
  ]);
  for (const tool of tools) {
    assert.ok(tool.description?.length > 30, `${tool.name}: thin description`);
  }
});

test('list_chassis_options mirrors the CLI catalog', async () => {
  const options = (await call('list_chassis_options')).json();

  // Imported from create-chassis, so this fails if the catalog moves.
  assert.ok(options.presets.fullstack, 'no fullstack preset');
  assert.deepEqual(options.db, ['none', 'mongo', 'postgres', 'sqlite']);
  assert.deepEqual(options.auth, [
    'none',
    'auth0',
    'jwt',
    'magic-only',
    'password+magic',
    'clerk'
  ]);
  assert.ok(options.addons.web, 'no web add-on');
  assert.equal(options.presets.fullstack.db, 'postgres');
  assert.ok(options.presets.fullstack.modules.includes('web'));
});

test('create_chassis_project scaffolds a single-package project', async () => {
  const directory = tmp();
  const result = (
    await call('create_chassis_project', {
      directory,
      preset: 'minimal',
      db: 'sqlite',
      auth: 'jwt'
    })
  ).json();

  assert.equal(result.monorepo, false);
  assert.equal(result.apiRoot, '.');
  assert.ok(result.layout.includes('src'));
  assert.ok(!result.layout.includes('apps'));
  assert.ok(fs.existsSync(path.join(directory, 'src/controllers/Password.controller.ts'))); // prettier-ignore
  assert.ok(fs.existsSync(result.conventions), 'AGENTS.md not reported');
  assert.match(result.writeCodeLikeThis, /resHandler/);
  assert.ok(result.nextSteps.some((s) => s.includes('npm install')));
});

test('create_chassis_project scaffolds the monorepo when web is on', async () => {
  const directory = tmp();
  const result = (
    await call('create_chassis_project', {
      directory,
      preset: 'minimal',
      auth: 'clerk',
      web: true
    })
  ).json();

  assert.equal(result.monorepo, true);
  assert.equal(result.apiRoot, 'apps/api');
  assert.ok(result.layout.includes('apps'));

  // The auth choice really reached the front end.
  const active = fs.readFileSync(
    path.join(directory, 'apps/web/auth/active.ts'),
    'utf8'
  );
  assert.match(active, /providers\/clerk/);
});

test('create_chassis_project refuses a non-empty directory', async () => {
  const directory = tmp();
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'keep-me.txt'), 'precious');

  const { res, body } = await call('create_chassis_project', { directory });
  assert.equal(res.isError, true, 'should have reported an error');
  assert.match(body, /not empty/);
  assert.equal(
    fs.readFileSync(path.join(directory, 'keep-me.txt'), 'utf8'),
    'precious',
    'existing files were touched'
  );
});

test('create_chassis_project rejects a stack the CLI does not support', async () => {
  const directory = tmp();
  const { res, body } = await call('create_chassis_project', {
    directory,
    db: 'mysql'
  });

  // The schema is derived from the CLI catalog, so this is caught before the
  // CLI runs — and the agent is told what it may use instead.
  assert.equal(res.isError, true);
  assert.match(body, /Invalid enum value/);
  assert.match(body, /'none' \| 'mongo' \| 'postgres' \| 'sqlite'/);
  assert.equal(fs.existsSync(directory), false, 'a directory was created');
});

test('chassis_conventions prefers a project AGENTS.md over the summary', async () => {
  const directory = tmp();
  await call('create_chassis_project', { directory, preset: 'minimal' });

  const fromProject = (await call('chassis_conventions', { directory })).body;
  const builtIn = (await call('chassis_conventions')).body;

  assert.match(fromProject, /Definition of done/);
  assert.match(builtIn, /Chassis conventions/);
  assert.notEqual(fromProject, builtIn);
});

test('server.json matches package.json', () => {
  // The MCP Registry reads server.json, npm reads package.json, and the
  // registry rejects a submission whose versions disagree.
  const pkg = JSON.parse(fs.readFileSync(path.join(mcpDir, 'package.json'), 'utf8')); // prettier-ignore
  const server = JSON.parse(fs.readFileSync(path.join(mcpDir, 'server.json'), 'utf8')); // prettier-ignore

  assert.equal(server.version, pkg.version, 'server.json version drifted');
  assert.equal(
    server.packages[0].version,
    pkg.version,
    'package entry drifted'
  );
  assert.equal(server.packages[0].identifier, pkg.name, 'package name drifted');
  assert.equal(
    server.name,
    pkg.mcpName,
    'server.json name must equal package.json mcpName — that pairing is how ' +
      'the registry proves you own the npm package'
  );
  assert.match(
    pkg.mcpName,
    /^io\.github\.[\w-]+\//,
    'GitHub auth requires the io.github.<user>/ namespace'
  );
});

test('server.json fits the registry schema limits', () => {
  // From the schema server.json points at. The registry enforces these on
  // submit, so overrunning one fails at `mcp-publisher publish` — after the
  // npm release that carried mcpName, which is the expensive place to find out.
  const server = JSON.parse(fs.readFileSync(path.join(mcpDir, 'server.json'), 'utf8')); // prettier-ignore
  const limits = { description: 100, name: 200, title: 100, version: 255 };

  for (const [field, max] of Object.entries(limits)) {
    const value = server[field];
    if (value === undefined) continue;
    assert.ok(
      value.length <= max,
      `server.json ${field} is ${value.length} chars, over the schema's ${max}`
    );
  }

  assert.ok(server.description, 'description is required');
  assert.equal(server.packages[0].transport.type, 'stdio');
});
