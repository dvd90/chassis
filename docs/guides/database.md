# Database

Chassis ships one database at a time — you pick it when scaffolding
(`--db mongo|postgres|sqlite`, or a preset). The ORM comes with the choice:
**Mongoose** for Mongo, **Drizzle** for Postgres and SQLite. Like every
integration it stays off until its env var is set, so the app boots
standalone in tests.

## Postgres / SQLite (Drizzle)

Set the connection string:

```bash
# .env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/chassis   # postgres
# or
SQLITE_PATH=chassis.db                                             # sqlite
```

`src/db/<engine>/` holds the Drizzle client (`db`) and your `schema.ts`. Add
tables there, or let the generator do it:

```bash
npm run gen Widget
```

This appends a `widgets` table to `schema.ts` and generates a controller
wired to Drizzle (`db.select().from(widgets)`, `insert().values().returning()`,
…). Then create and run the migration:

```bash
npx drizzle-kit generate --config src/db/<engine>/drizzle.config.ts
npx drizzle-kit migrate  --config src/db/<engine>/drizzle.config.ts
```

`/readyz` pings the database so orchestrators only route traffic once it's
reachable. With Docker enabled, `docker compose up -d` starts a matching
Postgres.

## MongoDB (Mongoose)

```bash
# .env
MONGODB_URI=mongodb://localhost:27017/chassis
```

Mongoose has no shared `db` handle — models register themselves on import.
`npm run gen Widget` writes `src/db/mongo/widget.model.ts` and a controller
using `WidgetModel`. No migration step.

## Switching or adding a database

The three are parallel integrations. To swap after scaffolding, follow the
[module contract](../modules.md): add `src/integrations/<db>.ts`, an env var +
`features.<db>` flag in `src/config`, and a guarded `init` in
`src/integrations/index.ts`. Prisma isn't shipped (its codegen fights the
everything-installed template), but drops in the same way if you prefer it.
