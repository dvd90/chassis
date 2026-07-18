#!/usr/bin/env node
/**
 * Controller generator:
 *
 *   npm run gen user          →  src/controllers/User.controller.ts
 *   npm run gen BlogPost      →  src/controllers/BlogPost.controller.ts
 *
 * Creates a CRUD controller + test and wires the export into
 * src/controllers/index.ts. The controller is DB-aware: it detects the
 * installed database (Drizzle Postgres/SQLite, or Mongoose) and generates
 * persistence code for it — falling back to an in-memory skeleton when no
 * database is installed.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const rawName = process.argv[2];

if (!rawName || !/^[A-Za-z][A-Za-z0-9]*$/.test(rawName)) {
  console.error(
    'Usage: npm run gen <Name>   (letters/digits, e.g. "user" or "BlogPost")'
  );
  process.exit(1);
}

const name = rawName[0].toUpperCase() + rawName.slice(1);
const varName = rawName[0].toLowerCase() + rawName.slice(1);
const plural = `${varName}s`;
const kebab = rawName.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

const root = path.resolve(import.meta.dirname, '..');
const controllerPath = path.join(
  root,
  'src',
  'controllers',
  `${name}.controller.ts`
);
const testPath = path.join(
  root,
  'src',
  '__tests__',
  `${kebab}.controller.test.ts`
);
const indexPath = path.join(root, 'src', 'controllers', 'index.ts');

if (fs.existsSync(controllerPath)) {
  console.error(`✖ ${path.relative(root, controllerPath)} already exists`);
  process.exit(1);
}

// Detect the installed database by probing the src tree (no deps needed).
const has = (p) => fs.existsSync(path.join(root, p));
const dbKind = has('src/db/postgres')
  ? 'postgres'
  : has('src/db/sqlite')
    ? 'sqlite'
    : has('src/db/mongo')
      ? 'mongo'
      : 'none';

let controller;
const extraFiles = [];

if (dbKind === 'postgres' || dbKind === 'sqlite') {
  // Append a table to the Drizzle schema, reusing helpers it already imports.
  const table =
    dbKind === 'postgres'
      ? `\nexport const ${plural} = pgTable('${plural}', {\n  id: serial('id').primaryKey(),\n  name: text('name').notNull()\n});\n`
      : `\nexport const ${plural} = sqliteTable('${plural}', {\n  id: integer('id').primaryKey({ autoIncrement: true }),\n  name: text('name').notNull()\n});\n`;
  const schemaPath = path.join(root, 'src', 'db', dbKind, 'schema.ts');
  fs.appendFileSync(schemaPath, table);
  extraFiles.push(`src/db/${dbKind}/schema.ts (added \`${plural}\` table)`);

  controller = `import { Request, Response } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { Routable, route, validate, AppError, ERROR_CODES } from '../core';
import { db } from '../db/${dbKind}';
import { ${plural} } from '../db/${dbKind}/schema';

const create${name}Schema = z.object({
  name: z.string().min(1)
});

export class ${name}Controller extends Routable {
  constructor() {
    super('/${kebab}s');
  }

  /**
   * @desc   List ${kebab}s
   * @access Public
   */
  @route('get', '/')
  async index(req: Request): Promise<Response> {
    return req.resHandler.ok({ items: await db.select().from(${plural}) });
  }

  /**
   * @desc   Get one ${kebab}
   * @access Public
   */
  @route('get', '/:id')
  async show(req: Request): Promise<Response> {
    const [item] = await db
      .select()
      .from(${plural})
      .where(eq(${plural}.id, Number(req.params.id)));
    if (!item) throw new AppError(ERROR_CODES.NOT_FOUND, '${name} not found');
    return req.resHandler.ok({ item });
  }

  /**
   * @desc   Create a ${kebab}
   * @access Public
   */
  @route('post', '/', [validate({ body: create${name}Schema })])
  async create(req: Request): Promise<Response> {
    const [item] = await db.insert(${plural}).values(req.body).returning();
    return req.resHandler.created({ item });
  }

  /**
   * @desc   Delete a ${kebab}
   * @access Public
   */
  @route('delete', '/:id')
  async destroy(req: Request): Promise<Response> {
    await db.delete(${plural}).where(eq(${plural}.id, Number(req.params.id)));
    return req.resHandler.noContent();
  }
}
`;
} else if (dbKind === 'mongo') {
  const modelPath = path.join(root, 'src', 'db', 'mongo', `${kebab}.model.ts`);
  fs.writeFileSync(
    modelPath,
    `import { Schema, model } from 'mongoose';

export interface ${name} {
  name: string;
}

const ${varName}Schema = new Schema<${name}>({
  name: { type: String, required: true }
});

export const ${name}Model = model<${name}>('${name}', ${varName}Schema);
`
  );
  extraFiles.push(`src/db/mongo/${kebab}.model.ts`);

  controller = `import { Request, Response } from 'express';
import { z } from 'zod';
import { Routable, route, validate, AppError, ERROR_CODES } from '../core';
import { ${name}Model } from '../db/mongo/${kebab}.model';

const create${name}Schema = z.object({
  name: z.string().min(1)
});

export class ${name}Controller extends Routable {
  constructor() {
    super('/${kebab}s');
  }

  /**
   * @desc   List ${kebab}s
   * @access Public
   */
  @route('get', '/')
  async index(req: Request): Promise<Response> {
    return req.resHandler.ok({ items: await ${name}Model.find() });
  }

  /**
   * @desc   Get one ${kebab}
   * @access Public
   */
  @route('get', '/:id')
  async show(req: Request): Promise<Response> {
    const item = await ${name}Model.findById(req.params.id);
    if (!item) throw new AppError(ERROR_CODES.NOT_FOUND, '${name} not found');
    return req.resHandler.ok({ item });
  }

  /**
   * @desc   Create a ${kebab}
   * @access Public
   */
  @route('post', '/', [validate({ body: create${name}Schema })])
  async create(req: Request): Promise<Response> {
    const item = await ${name}Model.create(req.body);
    return req.resHandler.created({ item });
  }

  /**
   * @desc   Delete a ${kebab}
   * @access Public
   */
  @route('delete', '/:id')
  async destroy(req: Request): Promise<Response> {
    await ${name}Model.findByIdAndDelete(req.params.id);
    return req.resHandler.noContent();
  }
}
`;
} else {
  // No database installed — in-memory skeleton.
  controller = `import { Request, Response } from 'express';
import { z } from 'zod';
import { Routable, route, validate } from '../core';

const create${name}Schema = z.object({
  name: z.string().min(1)
});

export class ${name}Controller extends Routable {
  constructor() {
    super('/${kebab}s');
  }

  /**
   * @desc   List ${kebab}s
   * @access Public
   */
  @route('get', '/')
  async index(req: Request): Promise<Response> {
    return req.resHandler.ok({ items: [] });
  }

  /**
   * @desc   Get one ${kebab}
   * @access Public
   */
  @route('get', '/:id')
  async show(req: Request): Promise<Response> {
    return req.resHandler.ok({ id: req.params.id });
  }

  /**
   * @desc   Create a ${kebab}
   * @access Public
   */
  @route('post', '/', [validate({ body: create${name}Schema })])
  async create(req: Request): Promise<Response> {
    return req.resHandler.created({ item: req.body });
  }

  /**
   * @desc   Delete a ${kebab}
   * @access Public
   */
  @route('delete', '/:id')
  async destroy(req: Request): Promise<Response> {
    return req.resHandler.noContent();
  }
}
`;
}

// The test hits the validation path only, so it needs no live database.
const test = `import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';

const app = createApp();

describe('${name}Controller', () => {
  it('POST /${kebab}s rejects an invalid body', async () => {
    const res = await request(app).post('/${kebab}s').send({});
    expect(res.status).toBe(400);
  });
});
`;

fs.writeFileSync(controllerPath, controller);
fs.writeFileSync(testPath, test);
fs.appendFileSync(indexPath, `export * from './${name}.controller';\n`);

console.log(`✔ Created src/controllers/${name}.controller.ts`);
for (const f of extraFiles) console.log(`✔ Created ${f}`);
console.log(`✔ Created src/__tests__/${kebab}.controller.test.ts`);
console.log(`✔ Exported from src/controllers/index.ts`);
if (dbKind !== 'none') {
  console.log(`\nDetected database: ${dbKind}`);
  if (dbKind !== 'mongo') {
    console.log(
      `Generate a migration:  npx drizzle-kit generate --config src/db/${dbKind}/drizzle.config.ts`
    );
  }
}
console.log(`\nTry it:  npm run dev   →   GET http://localhost:8000/${kebab}s`);
