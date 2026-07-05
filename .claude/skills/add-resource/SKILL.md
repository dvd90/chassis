---
name: add-resource
description: Add a complete REST resource (controller, validation, errors, and tests) to a Chassis project the idiomatic way. Use when the user asks to add an endpoint, resource, CRUD, model, or route to a Chassis / decorator-driven Express + TypeScript backend.
---

# Add a resource to Chassis

Scaffold and implement a REST resource so it matches Chassis conventions
exactly. Follow these steps in order. Read [AGENTS.md](../../../AGENTS.md)
first if you haven't — it defines the conventions this skill applies.

## Step 1 — Scaffold

Run the generator (converts the name to a controller class + base path):

```bash
npm run gen <Name>      # e.g. npm run gen book  ->  BookController at /books
```

This creates `src/controllers/<Name>.controller.ts`, a smoke test in
`src/__tests__/`, and adds the export to `src/controllers/index.ts`. If
the generator isn't available, create those three by hand modeled on an
existing `*.controller.ts`, and add the `export * from './<Name>.controller';`
line yourself.

## Step 2 — Define the input schema(s)

For every route that accepts input, write a zod schema. Put it at the top
of the controller file or in `src/schemas/<name>.schema.ts`:

```ts
const createBookSchema = z.object({
  title: z.string().min(1),
  author: z.string().min(1),
  year: z.coerce.number().int().min(0).optional()
});
```

## Step 3 — Implement the routes

Fill in the controller. Rules that keep it idiomatic:

- Decorate each method with `@route(method, path, [middlewares])` (or
  `@protectedRoute` when it requires auth).
- Attach validation via `validate({ body|query|params: schema })` in the
  middleware array.
- Return through `req.resHandler` — pick the helper that matches the
  outcome (`ok`, `created`, `noContent`, …).
- Signal failures by throwing `AppError` with the right `ERROR_CODES`
  entry. **No try/catch.**

```ts
@route('get', '/:id')
async show(req: Request): Promise<Response> {
  const book = await BookModel.findById(req.params.id);
  if (!book) throw new AppError(ERROR_CODES.NOT_FOUND, 'Book not found');
  return req.resHandler.ok(book);
}

@route('post', '/', [validate({ body: createBookSchema })])
async create(req: Request): Promise<Response> {
  return req.resHandler.created(await BookModel.create(req.body));
}
```

If a persistence layer is needed and the Mongo module is enabled, add a
Mongoose model in `src/models/<Name>.model.ts`. If it's not enabled, keep
the resource in-memory or ask the user which datastore they want — don't
silently add a database dependency.

## Step 4 — Keep logic out of the controller

If there's non-trivial business logic, put it in
`src/services/<name>.service.ts` and call it from the controller. The
controller should read as a thin HTTP ↔ domain translation.

## Step 5 — Write the tests

Extend the generated test to cover the real behavior: success cases plus
at least one validation failure (400) and one not-found (404). Tests use
supertest against `createApp()` — no running server. For routes needing a
throwaway controller, mount one via `createApp({ extraRoutables: [...] })`
(see `src/__tests__/app.test.ts`).

## Step 6 — Verify (required)

```bash
npm run verify
```

Do not finish until this passes — it runs typecheck, lint, and tests, the
same gate as CI. Fix real issues rather than suppressing them.

## Checklist

- [ ] Controller created and exported from `src/controllers/index.ts`
- [ ] Every input validated with a zod schema via `validate(...)`
- [ ] Responses go through `req.resHandler` (no `res.status().json()`)
- [ ] Failures throw `AppError` (no try/catch in the controller)
- [ ] Logic lives in a service if it's more than trivial
- [ ] Tests cover success + validation + not-found
- [ ] `npm run verify` passes
