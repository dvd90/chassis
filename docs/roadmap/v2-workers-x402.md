# Roadmap — Chassis v2: `workers` target + `x402` integration

> **Status: Planned — NOT started.** This document captures the intended
> scope for the next major evolution of Chassis. No implementation work
> has begun. Implementation starts only at **M0 (RFC)** and only once
> that RFC is reviewed and approved.

**Tagline:** _"The starter that ships paid APIs anywhere."_

## Vision

Evolve Chassis in two major steps while preserving every existing
convention and breaking nothing for current users:

1. **A `workers` deployment target** — the same Chassis conventions
   (Routable controllers, `@route` decorators, `resHandler`, `AppError`,
   zod config, callId correlation, opt-in integrations) running on
   Cloudflare Workers via a Hono adapter under the hood.
2. **An `x402` opt-in integration** — pay-per-call USDC monetization
   (HTTP 402, Coinbase CDP facilitator, Base network, Bazaar discovery)
   available on **both** targets through a `paid('$0.01')` route
   middleware.

**End state:**
`npm create chassis my-api -- --target=workers --with=x402` scaffolds a
monetized API deployable to the edge. The default Express/Node target
keeps working exactly as today — **zero breaking changes**.

## Architecture principles

- **Core/adapter split.** Extract runtime-agnostic logic into `src/core`
  (or a `core/` workspace package if the RFC justifies it). Two thin
  adapters: `adapters/express` (current behavior, byte-for-byte
  compatible) and `adapters/workers` (Hono on workerd).
- **Conventions are the product.** A controller written for one target
  MUST run on the other unchanged — same `Routable` +
  `@route`/`@protectedRoute`, same `req.resHandler.ok()` surface (adapter
  maps it to a Hono context), same `throw AppError`, same `validate()`
  middleware, same zod config module.
- **Adapter-owned lifecycle.** Express adapter keeps `server.ts` boot +
  graceful shutdown. Workers adapter exports a `fetch` handler, replaces
  graceful shutdown with per-request scoping, and documents that
  in-memory state is per-isolate and ephemeral.
- **Integrations declare target compatibility.**
  - `mongo` — Express-only for now (document why: TCP pooling per isolate)
  - `sentry` — both (use the Workers SDK on workers)
  - `auth0` — both (JWT verification is fetch-friendly)
  - `x402` — both
- **No breaking changes.** `npm run verify` on the Express target must
  pass unmodified throughout.

## The `x402` integration (`src/integrations/x402`)

- Opt-in via `WALLET_ADDRESS` env/secret; fully dormant otherwise
  (standard Chassis pattern).
- Exposes `paid(price: string)` route middleware usable in decorator
  middleware arrays on **both** targets:
  `@route('get', '/report', [paid('$0.01'), validate({...})])`.
- **x402 v2 only:** `@x402/core` + `@x402/evm` (+ `@x402/express` /
  `@x402/hono` adapters if current). Known v2 gotchas to verify against
  the live SDK before coding:
  - `amount`, not `maxAmountRequired`
  - CAIP-2 network IDs: `eip155:8453` (Base mainnet), `eip155:84532`
    (Base Sepolia)
  - `PAYMENT-SIGNATURE` header (accept legacy `X-PAYMENT`)
  - **Verify the real SDK surface on npm before implementing — do not
    code from memory.**
- Config (zod): `WALLET_ADDRESS`, `FACILITATOR_URL` (default CDP),
  `X402_NETWORK` (default Base mainnet).
- Bazaar discovery extension: `discoverable: true` plus per-route
  description/input/output schemas, settable in route metadata.
- Contributes a facilitator-reachability check to `/readyz`.
- Testing: mocked facilitator for unit/integration tests on both targets;
  one documented manual end-to-end script (`scripts/x402-e2e.ts`) using
  `@x402/fetch` on Base Sepolia.

## Milestones

TDD throughout. `npm run verify` stays green on the Express target at
every step. **Pause for review after each milestone.**

| # | Milestone | Deliverable / gate |
| --- | --- | --- |
| **M0** | **RFC** | `docs/rfc/workers-target.md` — what in `src/core` is runtime-agnostic vs Node-coupled; what each integration assumes about the runtime; how the `cli` composes modules today. **STOP for review before any implementation.** |
| **M1** | Core extraction | Express adapter consumes the extracted core. Zero behavior change; existing tests untouched. Golden test: the README `UserController` example compiles and behaves identically. |
| **M2** | Workers adapter | Hono adapter + wrangler template + `@cloudflare/vitest-pool-workers` setup. Same example controller passes an equivalent suite in workerd. `/status`, `/healthz`, `/readyz` work. Decorators build under wrangler's esbuild (document tsconfig/build flags). |
| **M3** | x402 integration | `paid()` green on both targets vs a mocked facilitator; Bazaar metadata wired; readyz contribution; e2e script documented. |
| **M4** | Scaffolder + docs | `npm create chassis` gains `--target=express\|workers` and `--with=x402`; generated projects pass their own `npm run verify`. Update README, `docs/` (new pages: workers target, x402 integration), `AGENTS.md`, `CLAUDE.md`, `llms.txt`, and the `add-resource` skill so agent-written controllers stay target-agnostic. |
| **M5** | Dogfood | `examples/paid-api-workers` — one paid endpoint deployed via `wrangler deploy`, real settled tx on Base Sepolia recorded in the example README. |

## Definition of done

- **Express target:** unchanged public API, all original tests green.
- **Workers target:** same controller code deployable via wrangler, tests
  in workerd green.
- **x402:** one middleware, two targets, mocked-facilitator tests +
  documented real-testnet transaction.
- **Scaffolder:** generates all four combinations (2 targets × x402
  on/off) and each passes verify.
- **Docs and agent files** updated; RFC reflects the final design.

## Guardrails

- If a Chassis convention cannot be preserved on Workers (e.g. SIGTERM
  shutdown), **document the divergence explicitly** in
  `docs/workers-target.md` rather than half-implementing it.
- Do not add other new features, integrations, or refactors beyond RFC
  scope.
- Prefer boring solutions; this is a template people clone — readability
  beats cleverness.

## Open questions / risks to resolve in the RFC

These are flagged now so M0 addresses them head-on; they are not
decisions yet.

- **Decorator metadata under esbuild.** The current registry relies on
  `experimentalDecorators` + prototype metadata. Confirm this survives
  wrangler/esbuild bundling, or design a build step that preserves it.
- **`resHandler` surface on Hono.** The response envelope + structured
  logging currently assume an Express `Response`. The adapter must map
  the full `resHandler` API onto a Hono `Context` without changing the
  client-visible envelope.
- **Config module on Workers.** `src/config` reads `process.env` +
  `dotenv`. Workers use `env` bindings, not `process.env`. The
  single-source-of-truth config rule must hold across both — likely an
  adapter-provided env source injected into the zod parse.
- **Logging.** winston is Node-oriented. Decide the Workers logging
  story (console-based structured JSON?) without diverging the log shape.
- **Workspace split.** Whether M1 stays single-package or becomes a
  monorepo (`core` + adapters) — decide in the RFC based on real import
  boundaries, not upfront.
- **x402 SDK churn.** v2 surface is young; pin versions and gate the
  integration behind mocked-facilitator tests so SDK changes are caught.
- **Scaffolder combinatorics.** 2 targets × x402 on/off × existing
  modules is a growing test matrix — the CLI's `chassis:<name>` marker
  pruning may need a parallel `target:<name>` mechanism (RFC to decide).

---

_When ready to begin, start at **M0** and produce the RFC first — do not
write implementation code before the RFC is approved._
