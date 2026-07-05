#!/usr/bin/env node
/**
 * Controller generator:
 *
 *   npm run gen user          →  src/controllers/User.controller.ts
 *   npm run gen BlogPost      →  src/controllers/BlogPost.controller.ts
 *
 * Creates a CRUD-skeleton controller + test and wires the export into
 * src/controllers/index.ts.
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

const controller = `import { Request, Response } from 'express';
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

const test = `import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';

const app = createApp();

describe('${name}Controller', () => {
  it('GET /${kebab}s returns 200', async () => {
    const res = await request(app).get('/${kebab}s');
    expect(res.status).toBe(200);
  });
});
`;

fs.writeFileSync(controllerPath, controller);
fs.writeFileSync(testPath, test);
fs.appendFileSync(indexPath, `export * from './${name}.controller';\n`);

console.log(`✔ Created src/controllers/${name}.controller.ts`);
console.log(`✔ Created src/__tests__/${kebab}.controller.test.ts`);
console.log(`✔ Exported from src/controllers/index.ts`);
console.log(`\nTry it:  npm run dev   →   GET http://localhost:8000/${kebab}s`);
