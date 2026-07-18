import { defineConfig } from 'drizzle-kit';

// drizzle-kit tooling config (runs outside the app). Generate migrations with:
//   npx drizzle-kit generate --config src/db/sqlite/drizzle.config.ts
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/sqlite/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.SQLITE_PATH ?? 'chassis.db' }
});
