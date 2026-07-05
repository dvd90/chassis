# Building an API

This guide builds a complete `books` resource: Mongoose model, validated
input, proper errors, and tests. It assumes you've read
[Getting started](../getting-started.md).

## 1. Start MongoDB and enable the integration

```bash
docker compose up -d mongo          # or any MongoDB you have around
echo 'MONGODB_URI=mongodb://localhost:27017/my-api' >> .env
npm run dev
```

```
info ✅ MongoDB connected
info Integrations enabled: mongo
```

`/readyz` now reports the connection state — try stopping Mongo and
watching it flip to 503.

## 2. Define the model

Create `src/models/Book.model.ts`:

```ts
import { model, Schema } from 'mongoose';

export interface Book {
  title: string;
  author: string;
  year?: number;
}

const bookSchema = new Schema<Book>(
  {
    title: { type: String, required: true },
    author: { type: String, required: true },
    year: { type: Number }
  },
  { timestamps: true }
);

export const BookModel = model<Book>('Book', bookSchema);
```

## 3. Define the input schema

Zod schemas double as validation _and_ TypeScript types. Create
`src/schemas/book.schema.ts`:

```ts
import { z } from 'zod';

export const createBookSchema = z.object({
  title: z.string().min(1),
  author: z.string().min(1),
  year: z.coerce.number().int().min(0).optional()
});

export type CreateBookInput = z.infer<typeof createBookSchema>;
```

## 4. Write the controller

Create `src/controllers/Book.controller.ts` (or start from
`npm run gen book` and edit):

```ts
import { Request, Response } from 'express';
import { AppError, ERROR_CODES, Routable, route, validate } from '../core';
import { BookModel } from '../models/Book.model';
import { createBookSchema } from '../schemas/book.schema';

export class BookController extends Routable {
  constructor() {
    super('/books');
  }

  @route('get', '/')
  async index(req: Request): Promise<Response> {
    const books = await BookModel.find().sort({ createdAt: -1 });
    return req.resHandler.ok({ items: books });
  }

  @route('get', '/:id')
  async show(req: Request): Promise<Response> {
    const book = await BookModel.findById(req.params.id);
    if (!book) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Book not found');
    }
    return req.resHandler.ok(book);
  }

  @route('post', '/', [validate({ body: createBookSchema })])
  async create(req: Request): Promise<Response> {
    const book = await BookModel.create(req.body);
    return req.resHandler.created(book);
  }

  @route('delete', '/:id')
  async destroy(req: Request): Promise<Response> {
    const deleted = await BookModel.findByIdAndDelete(req.params.id);
    if (!deleted) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Book not found');
    }
    return req.resHandler.noContent();
  }
}
```

Export it from `src/controllers/index.ts`:

```ts
export * from './Book.controller';
```

That's the entire wiring. Notice what you did **not** write: no router
file, no try/catch (thrown errors — including Mongoose failures — land
in the central error handler), no manual 400 handling (the `validate`
middleware answers with a structured issue list).

## 5. Try it

```bash
curl -X POST localhost:8000/books \
  -H 'content-type: application/json' \
  -d '{"title":"Dune","author":"Frank Herbert","year":1965}'
# 201 {"_id":"...","title":"Dune",...}

curl -X POST localhost:8000/books -H 'content-type: application/json' -d '{}'
# 400 {"statusReason":"Validation Failed","issues":[
#   {"part":"body","path":"title","message":"Required"},
#   {"part":"body","path":"author","message":"Required"}],...}

curl localhost:8000/books/000000000000000000000000
# 404 {"statusReason":"Not Found","message":"Book not found",...}
```

Every response carries an `x-call-id` header, and every log line carries
the same id — grep your logs by it when debugging.

## 6. Test it

Controllers are testable without a running server. For DB-backed tests,
either point `MONGODB_URI` at a throwaway database, use
[mongodb-memory-server](https://github.com/typegoose/mongodb-memory-server),
or keep controller logic thin and unit-test your services instead.

A pattern that needs no database — mount a throwaway controller through
the factory's test seam (`extraRoutables`) — is demonstrated in
`src/__tests__/app.test.ts`.

## 7. Keep growing

- Business logic getting thick? Add `src/services/book.service.ts` and
  keep controllers as thin translation layers.
- Need auth on the write paths? Change `@route` to `@protectedRoute` —
  see [Authentication](authentication.md).
- Need query-string filtering? `validate({ query: listBooksSchema })`
  works the same way as `body`.
