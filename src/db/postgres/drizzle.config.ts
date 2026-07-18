import { defineConfig } from 'drizzle-kit';

// drizzle-kit tooling config (runs outside the app), so it reads the env
// directly rather than through src/config. Generate migrations with:
//   npx drizzle-kit generate --config src/db/postgres/drizzle.config.ts
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/postgres/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' }
});
