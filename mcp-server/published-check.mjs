/**
 * Drives the chassis-mcp that is on npm right now, through a real MCP client.
 *
 * mcp-server/server.test.mjs tests this checkout against this checkout. That
 * cannot see the two things that break only once published: a file missing
 * from `files`, and a create-chassis release whose catalog no longer matches
 * what the server advertises.
 *
 *   node mcp-server/published-check.mjs
 *
 * Not shipped — `files` in package.json lists index.mjs only.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const problems = [];
const check = (ok, message) => {
  console.log(`  ${ok ? '✔' : '✖'} ${message}`);
  if (!ok) problems.push(message);
};

// Installed fresh rather than run through `npx`, which caches the whole
// dependency tree: a cached chassis-mcp kept serving create-chassis 0.3.0
// long after 0.3.1 fixed the path leak, and this check is the only thing
// that would notice.
const rig = fs.mkdtempSync(path.join(os.tmpdir(), 'chassis-mcp-rig-'));
spawnSync('npm', ['init', '-y'], { cwd: rig, stdio: 'ignore' });
const install = spawnSync('npm', ['i', 'chassis-mcp', '--no-audit', '--no-fund'], { cwd: rig, encoding: 'utf8' }); // prettier-ignore
if (install.status !== 0) {
  console.error(install.stderr);
  process.exit(1);
}

const cliVersion = JSON.parse(
  fs.readFileSync(path.join(rig, 'node_modules/create-chassis/package.json'), 'utf8') // prettier-ignore
).version;
console.log(`\nchassis-mcp resolves create-chassis@${cliVersion}`);

const client = new Client({ name: 'published-check', version: '1.0.0' });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [path.join(rig, 'node_modules/chassis-mcp/index.mjs')]
  })
);

const body = (res) => res.content.map((c) => c.text).join('');

console.log('\nchassis-mcp, as published:\n');

const { tools } = await client.listTools();
const names = tools.map((t) => t.name).sort();
check(
  names.join(',') ===
    'chassis_conventions,create_chassis_project,list_chassis_options',
  `advertises the three tools (got: ${names.join(', ') || 'none'})`
);

const options = JSON.parse(
  body(await client.callTool({ name: 'list_chassis_options', arguments: {} }))
);
check(Boolean(options.presets?.fullstack), 'catalog includes the fullstack preset'); // prettier-ignore
check(Boolean(options.addons?.web), 'catalog includes the web add-on');
check(
  Array.isArray(options.db) && options.db.includes('sqlite'),
  'catalog lists the databases'
);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chassis-published-'));
const directory = path.join(tmp, 'app');
const created = await client.callTool({
  name: 'create_chassis_project',
  arguments: { directory, preset: 'fullstack' }
});
check(!created.isError, `create_chassis_project succeeded — ${body(created).slice(0, 160)}`); // prettier-ignore

if (!created.isError) {
  const result = JSON.parse(body(created));
  check(result.monorepo === true, 'fullstack produced the monorepo layout');
  check(fs.existsSync(result.conventions), 'AGENTS.md is where it says it is');

  // The leak class that shipped in create-chassis 0.3.0.
  for (const leak of ['cli', 'site', 'mcp-server', '.chassisignore']) {
    check(!fs.existsSync(path.join(directory, leak)), `no ${leak} in the result`); // prettier-ignore
  }
}

const conventions = body(
  await client.callTool({ name: 'chassis_conventions', arguments: {} })
);
check(/resHandler/.test(conventions), 'conventions mention resHandler');

await client.close();
fs.rmSync(tmp, { recursive: true, force: true });
fs.rmSync(rig, { recursive: true, force: true });

if (problems.length) {
  console.error(`\n✖ ${problems.length} problem(s) with the published package`);
  process.exit(1);
}
console.log('\n✔ the published chassis-mcp works end to end\n');
