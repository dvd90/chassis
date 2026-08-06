#!/usr/bin/env node
/**
 * chassis-mcp — an MCP server that scaffolds Chassis backends.
 *
 * Lets an agent go from "build me an API with Postgres and auth" to a
 * project that already typechecks, lints and tests green, without knowing
 * the CLI's flags. Three tools:
 *
 *   list_chassis_options   what stacks exist, so the agent can choose
 *   create_chassis_project create one, non-interactively
 *   chassis_conventions    how to write code in it afterwards
 *
 * The option list is imported from create-chassis rather than restated, so
 * this server cannot advertise a stack the CLI does not support.
 *
 * Note this is a different thing from the MCP server inside a generated
 * project (`npm run mcp`), which exposes *that project's* API. This one
 * creates projects.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const require = createRequire(import.meta.url);

/** CHASSIS_CLI points at a local checkout; otherwise use the dependency. */
const cliPath =
  process.env.CHASSIS_CLI ?? require.resolve('create-chassis/index.mjs');

const { MODULES, GROUPS, PRESETS } = await import(
  pathToFileURL(path.join(path.dirname(cliPath), 'modules.mjs')).href
);

const variants = (group) => Object.keys(GROUPS[group].variants);

const text = (value) => ({
  content: [
    {
      type: 'text',
      text: typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    }
  ]
});

const failure = (message) => ({ ...text(message), isError: true });

/** Conventions to follow when writing code in a Chassis project. */
const CONVENTIONS = `# Chassis conventions

- Endpoints are methods on a class extending \`Routable\`, decorated with
  \`@route('get'|'post'|..., '/path', [middlewares])\`. Export the class from
  \`src/controllers/index.ts\` to mount it — there are no router files.
- Prefer \`npm run gen <Name>\` over hand-writing a controller: it is
  database-aware and wires the controller to the installed ORM.
- Respond via \`req.resHandler\`: \`.ok(data)\`, \`.created(data)\`,
  \`.noContent()\`, \`.notFound(msg)\`, \`.conflict(msg)\`. Never call
  \`res.status().json()\`.
- Signal errors with \`throw new AppError(ERROR_CODES.NOT_FOUND, 'message')\`.
  No try/catch in controllers — Express 5 forwards rejections to a central
  handler.
- Validate input with \`validate({ body: zodSchema })\` in the route's
  middleware array. The parsed body replaces \`req.body\`.
- Only \`src/config/index.ts\` reads \`process.env\`; it is a zod schema and
  the app refuses to boot on invalid config.
- Never edit \`src/core/**\` for feature work.
- Protect a route with \`@protectedRoute\`; it answers 501 until an auth
  provider is configured, never silently open.
- Finish by running \`npm run verify\` (typecheck + lint + test) and make it
  pass.

Full contract: the AGENTS.md file at the project root.
Docs: https://dvd90.github.io/chassis/ · https://dvd90.github.io/chassis/llms.txt`;

const server = new McpServer({ name: 'chassis-mcp', version: '0.1.0' });

// ── list_chassis_options ────────────────────────────────────

server.registerTool(
  'list_chassis_options',
  {
    title: 'List Chassis options',
    description:
      'List the presets, databases, auth providers and add-ons that ' +
      'create_chassis_project accepts. Call this first when you are not ' +
      'sure which stack to request.',
    inputSchema: {}
  },
  async () =>
    text({
      presets: Object.fromEntries(
        Object.entries(PRESETS).map(([name, preset]) => [
          name,
          {
            description: preset.label,
            db: preset.db,
            auth: preset.auth,
            modules: Object.entries(preset.modules)
              .filter(([, on]) => on)
              .map(([key]) => key),
            docker: preset.docker
          }
        ])
      ),
      db: variants('db'),
      auth: variants('auth'),
      addons: Object.fromEntries(
        Object.entries(MODULES).map(([key, mod]) => [key, mod.label])
      ),
      notes: [
        'Every option is independent: a preset can be overridden field by field.',
        'Local auth (jwt, magic-only, password+magic) ships its own sign-in endpoints, an identity store and a rotating-refresh session layer; auth0 and clerk are hosted.',
        'web=true adds a Next.js front end and makes the project an npm-workspaces monorepo (apps/api + apps/web).',
        'The generated project passes `npm run verify` and `npm run build` as created.'
      ]
    })
);

// ── create_chassis_project ──────────────────────────────────

server.registerTool(
  'create_chassis_project',
  {
    title: 'Create a Chassis project',
    description:
      'Scaffold a Chassis backend (Express 5 + TypeScript) into a new or ' +
      'empty directory. The result typechecks, lints and tests green as ' +
      'created, and contains only the modules chosen — declined ones are ' +
      'removed from the source and from package.json.',
    inputSchema: {
      directory: z
        .string()
        .describe('Target directory. Must not exist, or must be empty.'),
      preset: z
        .enum(Object.keys(PRESETS))
        .optional()
        .describe('Starting point; individual fields below override it.'),
      db: z.enum(variants('db')).optional().describe('Database and ORM.'),
      auth: z.enum(variants('auth')).optional().describe('Auth provider.'),
      web: z
        .boolean()
        .optional()
        .describe('Add a Next.js front end (workspaces monorepo).'),
      sentry: z.boolean().optional().describe('Sentry error reporting.'),
      mcp: z
        .boolean()
        .optional()
        .describe("An MCP server exposing the generated project's own API."),
      x402: z.boolean().optional().describe('x402 payment-gated routes.'),
      docker: z.boolean().optional().describe('Dockerfile + docker-compose.'),
      install: z
        .boolean()
        .optional()
        .describe('Run npm install afterwards. Default false — it is slow.')
    }
  },
  async (input) => {
    const target = path.resolve(input.directory);
    if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
      return failure(
        `${target} already exists and is not empty. Chassis refuses to ` +
          `overwrite it; choose another directory.`
      );
    }

    const args = [cliPath, target, '--no-git'];
    if (!input.install) args.push('--no-install');
    if (input.preset) args.push('--preset', input.preset);
    if (input.db) args.push('--db', input.db);
    if (input.auth) args.push('--auth', input.auth);
    for (const key of Object.keys(MODULES)) {
      if (input[key]) args.push(`--${key}`);
    }
    if (input.docker === true) args.push('--docker');
    if (input.docker === false) args.push('--no-docker');
    // The CLI already skips prompts without a TTY; be explicit anyway.
    args.push('--yes');

    const run = spawnSync(process.execPath, args, {
      encoding: 'utf8',
      timeout: 10 * 60 * 1000,
      env: process.env
    });

    if (run.status !== 0) {
      return failure(
        `create-chassis failed (exit ${run.status}):\n` +
          `${run.stderr || run.stdout || 'no output'}`
      );
    }

    const monorepo = fs.existsSync(path.join(target, 'apps'));
    const layout = fs
      .readdirSync(target)
      .filter((name) => !name.startsWith('.'))
      .sort();

    return text({
      created: target,
      layout,
      monorepo,
      apiRoot: monorepo ? 'apps/api' : '.',
      conventions: path.join(target, 'AGENTS.md'),
      nextSteps: [
        ...(input.install ? [] : [`cd ${target} && npm install`]),
        monorepo
          ? 'npm run dev   # API on :8000, web on :3000'
          : 'npm run dev   # API on :8000',
        'npm run gen <Name>   # scaffold a REST resource',
        'npm run verify       # typecheck + lint + test'
      ],
      // Repeated here so an agent that only calls this tool still gets them.
      writeCodeLikeThis: CONVENTIONS
    });
  }
);

// ── chassis_conventions ─────────────────────────────────────

server.registerTool(
  'chassis_conventions',
  {
    title: 'Chassis conventions',
    description:
      'How to write code in a Chassis project: controllers, responses, ' +
      'errors, validation, config, and the definition of done. Read this ' +
      'before editing a Chassis codebase.',
    inputSchema: {
      directory: z
        .string()
        .optional()
        .describe(
          'A Chassis project root. Its AGENTS.md is returned when present, ' +
            'which is more specific than the built-in summary.'
        )
    }
  },
  async ({ directory }) => {
    if (directory) {
      const agents = path.join(path.resolve(directory), 'AGENTS.md');
      if (fs.existsSync(agents)) return text(fs.readFileSync(agents, 'utf8'));
    }
    return text(CONVENTIONS);
  }
);

await server.connect(new StdioServerTransport());
