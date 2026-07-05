# CLAUDE.md

This project follows the conventions in **[AGENTS.md](AGENTS.md)** — read
it before making changes. Summary of the non-negotiables:

- Endpoints are `@route`-decorated methods on a `Routable` controller;
  export the class from `src/controllers/index.ts` to mount it.
- Respond via `req.resHandler` (`ok`, `created`, `notFound`, …), never
  `res.status().json()`.
- Signal errors by `throw new AppError(ERROR_CODES.X, message)` — no
  try/catch in controllers.
- Only `src/config` reads `process.env`.
- Don't edit `src/core/**` to build a feature.

**Always finish by running `npm run verify` (typecheck + lint + test) and
make it pass before stopping.**

Scaffold a new resource with `npm run gen <Name>`. Full docs in `docs/`.
