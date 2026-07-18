/**
 * The module catalog — the single source of truth for what create-chassis can
 * scaffold and, therefore, what it prunes. Imported by index.mjs (the CLI) and
 * by scaffold.test.mjs (the integration test), so the test asserts against the
 * exact data the CLI prunes from.
 */

// Independent on/off modules.
export const MODULES = {
  sentry: {
    label: 'Sentry error reporting',
    files: ['src/integrations/sentry.ts'],
    deps: ['@sentry/node']
  },
  mcp: {
    label: 'MCP server (AI-agent tools)',
    files: ['src/mcp'],
    deps: ['@modelcontextprotocol/sdk'],
    scripts: ['mcp']
  },
  x402: {
    label: 'x402 payments (@paidRoute)',
    files: ['src/integrations/x402.ts', 'src/types/x402-express.d.ts'],
    deps: ['x402-express']
  }
};

// Mutually-exclusive choice groups: pick exactly one variant. 'none' ships
// no code. Each variant is a module in the `chassis:<name>` marker namespace,
// so declining the others prunes exactly like a declined toggle.
export const GROUPS = {
  db: {
    label: 'Database',
    prompt: 'Which database?',
    default: 'none',
    variants: {
      none: { label: 'None' },
      mongo: {
        label: 'MongoDB (Mongoose)',
        files: ['src/integrations/mongo.ts', 'src/db/mongo'],
        deps: ['mongoose']
      },
      postgres: {
        label: 'Postgres (Drizzle)',
        files: ['src/integrations/postgres.ts', 'src/db/postgres'],
        deps: ['drizzle-orm', 'postgres'],
        devDeps: ['drizzle-kit']
      },
      sqlite: {
        label: 'SQLite (Drizzle)',
        files: ['src/integrations/sqlite.ts', 'src/db/sqlite'],
        deps: ['drizzle-orm', 'better-sqlite3'],
        devDeps: ['drizzle-kit', '@types/better-sqlite3']
      }
    }
  },
  auth: {
    label: 'Authentication',
    prompt: 'Which auth provider?',
    default: 'none',
    variants: {
      none: { label: 'None' },
      auth0: {
        label: 'Auth0 JWT',
        files: ['src/integrations/auth0.ts'],
        deps: ['express-oauth2-jwt-bearer']
      },
      jwt: {
        label: 'Local JWT (jose)',
        files: ['src/integrations/jwt.ts'],
        deps: ['jose']
      },
      clerk: {
        label: 'Clerk',
        files: ['src/integrations/clerk.ts'],
        deps: ['@clerk/express']
      }
    }
  }
};

// One-pick presets. `Custom` (handled in the CLI) prompts for each choice.
export const PRESETS = {
  api: {
    label: 'Recommended API — Postgres + JWT + Sentry + Docker',
    db: 'postgres',
    auth: 'jwt',
    modules: { sentry: true, mcp: false, x402: false },
    docker: true
  },
  lite: {
    label: 'Lite — SQLite + JWT, no external infrastructure',
    db: 'sqlite',
    auth: 'jwt',
    modules: { sentry: false, mcp: false, x402: false },
    docker: false
  },
  minimal: {
    label: 'Minimal — no database, no auth, standalone',
    db: 'none',
    auth: 'none',
    modules: { sentry: false, mcp: false, x402: false },
    docker: false
  }
};

/** Look up a module or group-variant descriptor by name. */
export function descriptor(name) {
  for (const group of Object.values(GROUPS)) {
    if (group.variants[name]) return group.variants[name];
  }
  return MODULES[name] ?? null;
}
