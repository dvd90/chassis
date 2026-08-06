import 'dotenv/config';
import { z } from 'zod';
import { durationSchema } from '../utils/duration'; // chassis:session

/**
 * All environment variables are declared and validated here — nothing else
 * in the codebase reads `process.env` directly. Optional variables toggle
 * their integration on/off (see `config.features`).
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(8000),
  CORS_ORIGINS: z.string().optional(),
  MONGODB_URI: z.string().optional(), // chassis:mongo
  DATABASE_URL: z.string().optional(), // chassis:postgres
  SQLITE_PATH: z.string().optional(), // chassis:sqlite
  AUTH0_DOMAIN: z.string().optional(), // chassis:auth0
  AUTH0_AUDIENCE: z.string().optional(), // chassis:auth0
  JWT_SECRET: z.string().optional(), // chassis:session
  SESSION_IDLE: durationSchema('30d'), // chassis:session
  SESSION_ABSOLUTE: durationSchema('90d'), // chassis:session
  AUTH_DEV_EMAIL: z.string().optional(), // chassis:session
  AUTH_DEV_PASSWORD: z.string().optional(), // chassis:password
  MAGIC_TOKEN_TTL: durationSchema('15m'), // chassis:magic
  MAGIC_CODE_ATTEMPTS: z.coerce.number().int().positive().default(5), // chassis:magic
  MAGIC_LINK_BASE_URL: z.string().default('http://localhost:8000'), // chassis:magic
  MAGIC_RETURN_TO_ORIGINS: z.string().optional(), // chassis:magic
  MAGIC_FROM: z.string().default('no-reply@localhost'), // chassis:magic
  SMTP_URL: z.string().optional(), // chassis:magic
  CLERK_SECRET_KEY: z.string().optional(), // chassis:clerk
  SENTRY_DSN: z.string().optional(), // chassis:sentry
  X402_PAY_TO: z.string().optional(), // chassis:x402
  X402_NETWORK: z.string().default('base-sepolia'), // chassis:x402
  MCP_API_URL: z.string().default('http://localhost:8000') // chassis:mcp
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    '❌ Invalid environment configuration:\n' +
      parsed.error.issues
        .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
        .join('\n')
  );
  process.exit(1);
}

const env = parsed.data;

export const config = {
  env: env.NODE_ENV,
  port: env.PORT,
  corsOrigins: env.CORS_ORIGINS
    ? env.CORS_ORIGINS.split(',').map((origin) => origin.trim())
    : undefined,
  mongo: { uri: env.MONGODB_URI }, // chassis:mongo
  postgres: { url: env.DATABASE_URL }, // chassis:postgres
  sqlite: { path: env.SQLITE_PATH ?? ':memory:' }, // chassis:sqlite
  auth0: { domain: env.AUTH0_DOMAIN, audience: env.AUTH0_AUDIENCE }, // chassis:auth0
  jwt: { secret: env.JWT_SECRET }, // chassis:session
  session: { idle: env.SESSION_IDLE, absolute: env.SESSION_ABSOLUTE }, // chassis:session
  authDev: { email: env.AUTH_DEV_EMAIL }, // chassis:session
  authDevPassword: env.AUTH_DEV_PASSWORD, // chassis:password
  magic: { tokenTtl: env.MAGIC_TOKEN_TTL, attempts: env.MAGIC_CODE_ATTEMPTS }, // chassis:magic
  magicLink: { base: env.MAGIC_LINK_BASE_URL }, // chassis:magic
  magicReturnTo: { origins: env.MAGIC_RETURN_TO_ORIGINS }, // chassis:magic
  mail: { from: env.MAGIC_FROM, smtpUrl: env.SMTP_URL }, // chassis:magic
  clerk: { secretKey: env.CLERK_SECRET_KEY }, // chassis:clerk
  sentry: { dsn: env.SENTRY_DSN }, // chassis:sentry
  x402: { payTo: env.X402_PAY_TO, network: env.X402_NETWORK }, // chassis:x402
  mcp: { apiUrl: env.MCP_API_URL }, // chassis:mcp
  /**
   * Feature flags derived from the environment: an integration is enabled
   * if — and only if — its configuration is present.
   */
  features: {
    mongo: Boolean(env.MONGODB_URI), // chassis:mongo
    postgres: Boolean(env.DATABASE_URL), // chassis:postgres
    sqlite: Boolean(env.SQLITE_PATH), // chassis:sqlite
    auth0: Boolean(env.AUTH0_DOMAIN && env.AUTH0_AUDIENCE), // chassis:auth0
    session: Boolean(env.JWT_SECRET), // chassis:session
    clerk: Boolean(env.CLERK_SECRET_KEY), // chassis:clerk
    sentry: Boolean(env.SENTRY_DSN), // chassis:sentry
    x402: Boolean(env.X402_PAY_TO) // chassis:x402
  } as Record<string, boolean>
};
