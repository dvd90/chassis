import 'dotenv/config';
import { z } from 'zod';

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
  AUTH0_DOMAIN: z.string().optional(), // chassis:auth0
  AUTH0_AUDIENCE: z.string().optional(), // chassis:auth0
  SENTRY_DSN: z.string().optional() // chassis:sentry
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
  auth0: { domain: env.AUTH0_DOMAIN, audience: env.AUTH0_AUDIENCE }, // chassis:auth0
  sentry: { dsn: env.SENTRY_DSN }, // chassis:sentry
  /**
   * Feature flags derived from the environment: an integration is enabled
   * if — and only if — its configuration is present.
   */
  features: {
    mongo: Boolean(env.MONGODB_URI), // chassis:mongo
    auth0: Boolean(env.AUTH0_DOMAIN && env.AUTH0_AUDIENCE), // chassis:auth0
    sentry: Boolean(env.SENTRY_DSN) // chassis:sentry
  } as Record<string, boolean>
};
