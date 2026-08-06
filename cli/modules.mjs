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
    files: ['src/integrations/x402.ts'],
    deps: ['x402-express']
  },
  web: {
    label: 'Next.js front end (npm-workspaces monorepo)',
    files: ['web'],
    scripts: ['verify:web', 'dev:web'],
    // `deps` are always the API's. The web app keeps its own package.json,
    // so its dependencies are declared under `web` blocks and pruned there.
    web: { deps: ['next', 'react', 'react-dom'] }
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
        deps: ['express-oauth2-jwt-bearer'],
        web: {
          provider: 'auth0',
          files: [
            'web/auth/providers/auth0.tsx',
            'web/auth/providers/auth0.shared.ts',
            'web/auth/providers/auth0.middleware.ts'
          ],
          deps: ['@auth0/nextjs-auth0']
        }
      },
      // The three local variants are composition only: they own no files and
      // no dependencies, and exist to name a combination of IMPLIED modules.
      // `jwt` keeps its name so `--auth jwt`, the presets, already-published
      // CLI versions and the docs all keep working.
      jwt: {
        label: 'Local — password',
        implies: ['session', 'password'],
        web: { provider: 'jwt' }
      },
      'magic-only': {
        label: 'Local — magic link, no password',
        implies: ['session', 'magic'],
        web: { provider: 'jwt' }
      },
      'password+magic': {
        label: 'Local — password and magic link',
        implies: ['session', 'password', 'magic'],
        web: { provider: 'jwt' }
      },
      clerk: {
        label: 'Clerk',
        files: ['src/integrations/clerk.ts'],
        deps: ['@clerk/express'],
        web: {
          provider: 'clerk',
          files: [
            'web/auth/providers/clerk.tsx',
            'web/auth/providers/clerk.middleware.ts'
          ],
          deps: ['@clerk/nextjs']
        }
      }
    }
  }
};

/**
 * Modules that are never chosen directly — an auth variant pulls them in via
 * `implies`. They live outside MODULES so the interactive "Custom" path never
 * prompts for them and presets never have to list them.
 *
 * The split exists because the three local auth variants share a session layer
 * and overlap on the password and magic halves. A file may be claimed by only
 * one module, so a variant that needed the union of two file sets could not be
 * expressed with a flat `files` list; composition can.
 */
export const IMPLIED = {
  session: {
    label: 'Session layer (access token + rotating refresh token)',
    files: [
      'src/integrations/jwt.ts',
      'src/services/session.ts',
      'src/services/session.test.ts',
      'src/controllers/Session.controller.ts',
      'src/middleware/rateLimit.ts',
      'src/middleware/sameOrigin.ts',
      'src/utils/clock.ts',
      'src/utils/duration.ts',
      'src/utils/duration.test.ts',
      'src/utils/tokens.ts',
      'src/utils/tokens.test.ts',
      'src/utils/cookies.ts',
      'src/db/users.ts',
      'src/db/memory-users.ts',
      'src/db/sessions.ts',
      'src/db/memory-sessions.ts',
      'src/__tests__/session.test.ts',
      'docs/guides/sessions.md'
    ],
    // Present only when the matching database was also chosen — the auth × db
    // cross-product a flat `files` list cannot express, so it is never
    // asserted present.
    crossFiles: [
      'src/db/sqlite/users.ts',
      'src/db/sqlite/users.schema.ts',
      'src/db/sqlite/users.test.ts',
      'src/db/sqlite/sessions.ts',
      'src/db/sqlite/sessions.schema.ts',
      'src/db/postgres/users.ts',
      'src/db/postgres/users.schema.ts',
      'src/db/postgres/sessions.ts',
      'src/db/postgres/sessions.schema.ts',
      'src/db/mongo/users.ts',
      'src/db/mongo/sessions.ts'
    ],
    deps: ['jose'],
    web: {
      files: [
        'web/auth/providers/jwt.tsx',
        'web/auth/providers/jwt.client.tsx',
        'web/auth/providers/jwt.forms.ts',
        'web/auth/providers/jwt.shared.ts',
        'web/auth/providers/jwt.middleware.ts',
        'web/auth/providers/jwt.middleware.test.ts',
        'web/app/api'
      ]
    }
  },
  password: {
    label: 'Password sign-in',
    files: [
      'src/utils/password.ts',
      'src/controllers/Password.controller.ts',
      'src/db/passwords.ts',
      'src/db/memory-passwords.ts',
      'src/__tests__/password.test.ts',
      'docs/guides/password-auth.md'
    ],
    crossFiles: [
      'src/db/sqlite/passwords.ts',
      'src/db/sqlite/passwords.test.ts',
      'src/db/postgres/passwords.ts',
      'src/db/mongo/passwords.ts'
    ],
    web: {
      files: [
        'web/auth/providers/jwt.password-form.tsx',
        // Nested inside web/app/api, which the session module owns wholesale.
        'web/app/api/session/password'
      ]
    }
  },
  magic: {
    label: 'Magic-link sign-in',
    files: [
      'src/services/magic.ts',
      'src/services/magic.test.ts',
      'src/controllers/Magic.controller.ts',
      'src/controllers/magic.page.ts',
      'src/db/magic.ts',
      'src/db/memory-magic.ts',
      'src/mail',
      'src/sms',
      'src/__tests__/magic.test.ts',
      'src/__tests__/magic.e2e.test.ts',
      'docs/guides/magic-link.md',
      'docs/guides/transports.md'
    ],
    crossFiles: [
      'src/db/sqlite/magic.ts',
      'src/db/sqlite/magic.schema.ts',
      'src/db/postgres/magic.ts',
      'src/db/postgres/magic.schema.ts',
      'src/db/mongo/magic.ts'
    ],
    deps: ['nodemailer'],
    devDeps: ['@types/nodemailer'],
    web: {
      files: [
        'web/auth/providers/jwt.magic-form.tsx',
        'web/app/auth',
        // Nested inside web/app/api, which the session module owns wholesale.
        'web/app/api/session/magic'
      ]
    }
  }
};

// One-pick presets. `Custom` (handled in the CLI) prompts for each choice.
export const PRESETS = {
  api: {
    label: 'Recommended API — Postgres + JWT + Sentry + Docker',
    db: 'postgres',
    auth: 'jwt',
    modules: { sentry: true, mcp: false, x402: false, web: false },
    docker: true
  },
  fullstack: {
    label: 'Full-stack — Postgres + JWT + Next.js front end + Sentry + Docker',
    db: 'postgres',
    auth: 'jwt',
    modules: { sentry: true, mcp: false, x402: false, web: true },
    docker: true
  },
  lite: {
    label: 'Lite — SQLite + JWT, no external infrastructure',
    db: 'sqlite',
    auth: 'jwt',
    modules: { sentry: false, mcp: false, x402: false, web: false },
    docker: false
  },
  minimal: {
    label: 'Minimal — no database, no auth, standalone',
    db: 'none',
    auth: 'none',
    modules: { sentry: false, mcp: false, x402: false, web: false },
    docker: false
  }
};

/**
 * Where each part of the single-package template lands when the Next.js
 * front end is included and the project becomes an npm-workspaces monorepo.
 * Everything not listed stays at the repo root (docs, README, LICENSE,
 * .github, docker-compose.yml, prettier/husky config).
 */
export const MONOREPO = {
  apiDir: 'apps/api',
  webDir: 'apps/web',
  /** Moved into `apps/api` — the backend and everything that builds it. */
  apiPaths: [
    'src',
    'scripts',
    'tsconfig.json',
    'tsconfig.build.json',
    'vitest.config.ts',
    'eslint.config.mjs',
    '.env.example',
    'Dockerfile',
    '.dockerignore'
  ],
  /** Root scripts/devDeps stay repo-wide; the rest belong to apps/api. */
  rootScripts: ['format', 'prepare'],
  rootDevDeps: ['prettier', 'husky']
};

/** Look up a module, group-variant or implied-module descriptor by name. */
export function descriptor(name) {
  for (const group of Object.values(GROUPS)) {
    if (group.variants[name]) return group.variants[name];
  }
  return MODULES[name] ?? IMPLIED[name] ?? null;
}

/** The modules a selected group variant drags in with it. */
export function impliedBy(name) {
  return descriptor(name)?.implies ?? [];
}
