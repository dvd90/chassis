# Copilot instructions

This project follows the conventions in [AGENTS.md](../AGENTS.md) — read it
before making changes. Summary of the non-negotiables:

- Endpoints are `@route`-decorated methods on a `Routable` controller; export
  the class from `src/controllers/index.ts` to mount it. There are no router
  files to edit.
- Respond via `req.resHandler` (`ok`, `created`, `notFound`, `conflict`, …),
  never `res.status().json()`.
- Signal errors by `throw new AppError(ERROR_CODES.X, message)` — no try/catch
  in controllers; Express 5 forwards rejected promises to a central handler.
- Validate input with `validate({ body: zodSchema })` in the route's middleware
  array.
- Only `src/config` reads `process.env`.
- Don't edit `src/core/**` to build a feature.

Scaffold a new resource with `npm run gen <Name>` rather than hand-writing one —
it is database-aware and wires the controller to the installed ORM.

**Finish by running `npm run verify` (typecheck + lint + test) and make it pass
before stopping.**
