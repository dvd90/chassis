import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../../config';
import * as schema from './schema';

// postgres.js connects lazily — no socket is opened until the first query,
// so importing `db` is safe even when Postgres isn't configured.
// ponytail: placeholder DSN keeps types happy when DATABASE_URL is unset;
// it is never dialed because initPostgres() only runs when the feature is on.
const client = postgres(config.postgres.url ?? 'postgres://localhost/chassis', {
  max: 5
});

export const db = drizzle(client, { schema });
export { schema };

export async function pingPostgres(): Promise<boolean> {
  try {
    await client`select 1`;
    return true;
  } catch {
    return false;
  }
}

export async function closePostgres(): Promise<void> {
  await client.end();
}
