# Design: magic-link auth + refresh sessions

Status: **built.** The design below is what shipped; §9 records where the
implementation departed from the plan, and why.

## Why

Chassis ships one first-party auth option: local JWT with a password. The
`chassis:jwt` module bundles four unrelated things — password hashing, JWT
minting, the user store, and the web sign-in form — with two consequences:

- a product that wants email-link sign-in cannot get one, and
- a product that wants password auth *removed* cannot remove it without losing
  the session layer too.

This adds a magic-link module (256-bit link token plus a 6-digit cross-device
code, both hashed at rest) and a refresh-token session layer (rotation, reuse
detection, revoke-all), and splits `chassis:jwt` into three composable modules
so `--auth magic-only` scaffolds a project containing no password code at all.

## 1. Current state

Established by reading the repo, not assumed. Everything below is why the
design looks the way it does.

| Concern | Reality |
|---|---|
| Session primitive | **Local JWT, stateless bearer.** `SignJWT` HS256 via a dynamic `import('jose')`, `TOKEN_TTL = '1h'`, no `jti`/`iss`/`aud`, no refresh — `src/controllers/Auth.controller.ts:19-49`. Verification discards the claims — `src/integrations/jwt.ts:29` |
| Cookies | **The API sets none.** The only cookie boundary is the Next route `web/app/api/session/route.ts:30-37` (`chassis_token`, httpOnly, SameSite=Lax, `secure` in production) |
| Auth seam | Module-level provider with a 501-when-unset fallback — `src/core/auth.ts:9-37`. Mirrored by payments, `src/core/payments.ts:11-15` |
| DI | **No container.** Controllers are constructed zero-arg (`src/app.ts:40`), so an optional capability is a module-level `let x` plus `setX()`, resolved per request |
| Store selection | A flag-keyed **table**, not an if-chain, so pruning to zero databases keeps `config` referenced and the build green — `src/db/users.ts:35-44` |
| Errors | `throw new AppError(ERROR_CODES.X)`; codes are a `satisfies Record<string, ErrorCode>` table at `src/core/errors.ts:8-37`, mapped at `src/core/errorHandler.ts:19-24` |
| Responses | 13 methods on `ResponseHandler`, **all JSON** — `src/core/response.ts:29-95`. No HTML, no redirect |
| Config | One zod schema, `process.exit(1)` on bad env — `src/config/index.ts:9-40`. **No duration parsing anywhere**; `'1h'` is a hardcoded string |
| Tests | vitest, `src/**/*.test.ts`. Integration is supertest against `createApp({ extraRoutables })` with no `listen()`. Env-dependent modules must be imported **dynamically inside `beforeAll`** — `src/__tests__/auth.test.ts:14-16` |
| Clock | **None.** One `new Date()` in `src/` (`src/db/sqlite/users.ts:30`) and no fake timers anywhere, so token expiry is currently untestable |
| Mail | **None.** No transport, no dependency, no `SMTP_*` env var |
| Rate limiting | **None.** `/auth/login` is unthrottled and runs scrypt per attempt |
| CSRF | **None** beyond `SameSite=Lax` on the one web cookie. The API is cookie-free, so classic CSRF does not reach it today |
| Migrations | **No `drizzle/` directory and no `db:migrate` script.** `drizzle-kit generate` is run by hand (`docs/guides/authentication.md:110-115`); tests create tables with raw SQL (`src/db/sqlite/users.test.ts:15-24`) |
| Queues | **None.** No scheduler, outbox, or job runner |
| Prune model | `chassis:<module>` end-of-line markers are line-stripped for declined modules, then `files`/`crossFiles`/`deps`/`scripts` are deleted — `cli/index.mjs:333-406`. The catalog is `cli/modules.mjs` |

## 2. Session strategy: the local-JWT variant

The primitive found above is a stateless bearer JWT, so the session layer is
**short-lived access token + rotating refresh token**, not cookie sessions.

- **Access token** — HS256 JWT, `ACCESS_TOKEN_TTL` (default `15m`), `sub` is the
  identity id plus `sid` for the family. Verified by the existing
  `src/integrations/jwt.ts`.
- **Refresh token** — 256-bit base64url, **SHA-256 at rest**, one row per token,
  `family_id` grouping every token descended from a single sign-in.
- **Rotated on every use** — the presented row gets `rotated_at`, a fresh row is
  inserted into the same family.
- **Reuse detection** — presenting a row that already has `rotated_at` revokes
  the **entire family** and answers 401.
- `SESSION_IDLE` (30d) is the per-token TTL, renewed on each rotation.
  `SESSION_ABSOLUTE` (90d) caps the family's creation time and is checked on
  every refresh.
- A magic redemption or a password sign-in always starts a **new family** —
  that is the rotation-on-auth-event requirement.

`iat`/`exp` are passed to jose as explicit epoch numbers and verification passes
`currentDate`, so the injected clock drives token expiry with no system-clock
patching. **No `new Date()` appears in auth logic**; `src/utils/clock.ts` is the
only time source.

## 3. Module decomposition

`chassis:jwt` splits into three *implied* modules composed by auth variants:

```
IMPLIED — a new export in cli/modules.mjs; never prompted, never a preset key
  session   jose, clock, refresh store, users table, refresh/logout/revoke-all
  password  scrypt, register/login, password_hash column, dev-password env
  magic     magic store, mail, SMS seam, rate limit, confirm page, code fallback

GROUPS.auth.variants — composition only; no files or deps of their own
  none
  auth0            unchanged
  clerk            unchanged
  jwt              implies: ['session', 'password']      ← name kept
  magic-only       implies: ['session', 'magic']
  password+magic   implies: ['session', 'password', 'magic']
```

`implies` is necessary rather than stylistic: the catalog integrity test forbids
one file being claimed by two modules, and `password+magic` needs the union of
two file sets. Per-variant file lists cannot express that; composition is about
six lines in the CLI.

`jwt` keeps its name so `--auth jwt`, all four presets, the published
`create-chassis`, and the catalog-derived `chassis-mcp` schema keep working.

### CLI changes

1. `export const IMPLIED = { session, password, magic }`, usual descriptor shape.
2. `descriptor()` consults `IMPLIED` after `GROUPS` and `MODULES`.
3. `kept` gains the selected variant's `implies`; `declined` sweeps
   `Object.keys(IMPLIED)` minus kept (`cli/index.mjs:313-331`).
4. `selectWebAuthProvider` maps all three local variants onto the existing `jwt`
   web provider, so `web/auth/providers/conformance.ts` needs no new entry.

**The marker pruner is not changed.** `.tsx` is absent from both the pruner's
extension list (`cli/index.mjs:344`) and the marker-residue grep in
`.github/workflows/published.yml:66-67`. Rather than extend two regexes and then
fight Prettier over where a marker may legally sit inside JSX — where
`{/* chassis:x */}` does not match `MARKER_LINE` and would leak into kept output
— every marker stays in `.ts`, and a new integrity test asserts that **no `.tsx`
file ever contains a `chassis:` marker**. Today's silent gap becomes a guarded
invariant.

## 4. File plan

### New — session (`chassis:session`)

| File | Contents |
|---|---|
| `src/utils/clock.ts` | `let clock = () => new Date()`, `now()`, `setClock()` — the `core/auth.ts` seam idiom, six lines |
| `src/utils/duration.ts` | `seconds('15m') -> 900`. Its own file, not a config helper, so pruning both modules cannot leave an unused local (`noUnusedLocals` is on) |
| `src/utils/tokens.ts` | `randomToken()` (32 bytes base64url), `randomCode()` (`crypto.randomInt`), `sha256()`, `timingSafeEqualHex()` |
| `src/utils/cookies.ts` | Three-line `req.headers.cookie` read. Express 5 has `res.cookie()` natively, so no dependency |
| `src/services/session.ts` | Mint access JWT; issue, rotate, revoke refresh; family reuse detection; idle and absolute checks |
| `src/db/sessions.ts`, `src/db/memory-sessions.ts` | `RefreshTokenStore` and `sessionStore()`, cloned from the table pattern at `src/db/users.ts:35-44` |
| `src/controllers/Session.controller.ts` | `POST /auth/refresh`, `/auth/logout`, `/auth/revoke-all` |
| `src/middleware/rateLimit.ts` | Fixed-window `Map` keyed by a caller-supplied function, driven by the injected clock |
| `src/middleware/sameOrigin.ts` | `Origin`/`Sec-Fetch-Site` check against `config.corsOrigins`, for the cookie endpoints only |

### New — magic (`chassis:magic`)

| File | Contents |
|---|---|
| `src/services/magic.ts` | `issue()` (latest-wins void, then generate both credentials), `probe()`, `redeemToken()`, `redeemCode()`, `validateReturnTo()`, `setOnVerified()` |
| `src/db/magic.ts`, `src/db/memory-magic.ts` | `MagicStore` and `magicStore()`, same table pattern |
| `src/mail/index.ts` | `MailTransport { send({ to, subject, html, text }) }`, `setMailTransport()`, default console logger |
| `src/mail/smtp.ts` | nodemailer to mailpit. The **only** shipped transport, for dev and the e2e |
| `src/mail/template.ts` | One function returning `{ subject, html, text }`; link primary, code secondary, no images required to function |
| `src/sms/index.ts` | `SmsTransport { send({ to, text }) }`, `setSmsTransport()`, `setSmsRecipient((identity) => string \| null)`. Both default to no-ops |
| `src/controllers/Magic.controller.ts` | The four endpoints in §5 |
| `web/app/auth/magic/[token]/page.tsx` | Confirm page — a server component calling the JSON probe |
| `web/app/api/session/magic/route.ts` | POSTs redeem, sets cookies at the existing web boundary, redirects |

**No production delivery providers ship** — not for mail, not for SMS. Resend,
SendGrid, SES, Postmark, Twilio, Vonage, SNS and MessageBird are *documented*
bindings against these two seams and nothing more (`docs/guides/transports.md`).
There is no `MAGIC_CHANNEL` variable either: the channels are whatever the
product bound. `setSmsRecipient()` exists so SMS needs no `phone` column and no
identity-schema change — an unbound resolver means SMS silently does nothing.

### Renamed and restructured

- `src/controllers/Auth.controller.ts` becomes
  **`src/controllers/Password.controller.ts`** (`chassis:password`), reduced to
  register and login.
- `src/utils/password.ts` is unchanged; ownership moves to `chassis:password`.
- `src/integrations/jwt.ts` moves to `chassis:session`, gains `algorithms` and
  `currentDate` on `jwtVerify`, and stops discarding claims — it attaches
  `req.identityId`.
- `src/db/users.ts`: `passwordHash` becomes optional and marked
  `chassis:password`; `verifiedAt` is added; `UserStore` gains `findById`,
  `createFromEmail` and `markVerified`.
- Per-engine cross-files join `IMPLIED.session.crossFiles` and
  `IMPLIED.magic.crossFiles`: `src/db/{sqlite,postgres}/{sessions,magic}.ts` and
  their `.schema.ts`, `src/db/mongo/{sessions,magic}.ts`, plus marked `export *`
  lines in each engine's `schema.ts`.
- `src/__tests__/auth.test.ts` splits into `password.test.ts`, `session.test.ts`
  and `magic.test.ts`.
- `web/auth/providers/jwt.client.tsx` splits so no `.tsx` needs a marker. The
  password form moves to `jwt.password-form.tsx` (`chassis:password`), a new
  `jwt.magic-form.tsx` (`chassis:magic`) joins it, and the shell maps over a
  registry whose *lines* carry the markers:

  ```ts
  // web/auth/providers/jwt.forms.ts — plain .ts, pruned already, Prettier-stable
  import { PasswordForm } from './jwt.password-form'; // chassis:password
  import { MagicForm } from './jwt.magic-form'; // chassis:magic

  export const forms = [
    PasswordForm, // chassis:password
    MagicForm // chassis:magic
  ];
  ```

  Pruning either line leaves valid TypeScript (`[PasswordForm,]` and
  `[MagicForm]` both parse), and the `.tsx` shell contains zero markers.

### Core additions

`src/core/response.ts` gains `html(markup)` and `seeOther(url)`, plus `SEE_OTHER`
in `src/core/errors.ts` — about 14 lines. They are unmarked, because core is
never pruned, and they are generic responders rather than magic-specific ones.
This is a deliberate framework extension; see conflict 1.

### Docs

Every markdown file under `docs/` must appear in `site/pages.mjs` or the site
build fails (`site/build.mjs:342-361`).

- `docs/design/magic-link.md` — this note. `docs/design` is added to
  `.chassisignore` so it never ships into a generated project; nested paths are
  honored (`.chassisignore:11`, `cli/index.mjs:276`).
- `docs/guides/authentication.md` becomes a provider-agnostic overview.
- New and module-owned, so they are deleted with their module:
  `docs/guides/password-auth.md`, `docs/guides/magic-link.md`,
  `docs/guides/sessions.md`, `docs/guides/transports.md`.
- `docs/reference/configuration.md` — auth env rows move into the module guides.
- `docs/modules.md` and `docs/maintainers.md` document the `IMPLIED`/`implies`
  contract; `docs/reference/cli.md` lists the new `--auth` values.
- `README.md` gains a magic-link section, worded without "password".

## 5. API surface

| Method | Path | Behaviour |
|---|---|---|
| `POST` | `/auth/magic/request` | `{ email, returnTo? }` → **202 with a byte-identical body every time**. Responds *before* touching the store, then does lookup, issue and send in a detached promise, so response timing is uniform by construction. Rate limited per-email and per-IP in separate buckets |
| `GET`, `HEAD` | `/auth/magic/:token` | **Never consumes.** An HTML confirm page by default; with `Accept: application/json`, `{ status: 'valid' \| 'expired' \| 'used', returnTo }` |
| `POST` | `/auth/magic/redeem` | `{ token }`, single use. Sets the refresh cookie and answers 303 to the re-validated `returnTo`. No CSRF check — the token *is* the credential |
| `POST` | `/auth/magic/code` | `{ email, code }`, constant-time compare, `MAGIC_CODE_ATTEMPTS` cap, then void every credential for that email |
| `POST` | `/auth/refresh` | Cookie or body. Rotates; reuse revokes the family. `sameOrigin` |
| `POST` | `/auth/logout` | Idempotent, revokes one family. `sameOrigin` |
| `POST` | `/auth/revoke-all` | `@protectedRoute`, revokes every family for the identity. `sameOrigin` |
| `POST` | `/auth/register`, `/auth/login` | Unchanged, `chassis:password` |

Three `Routable`s share the `/auth` base path; Express mounts multiple routers
on one path without complaint (`src/core/routable.ts:57`).

The `GET`-never-consumes rule is the point of the two-step flow: corporate mail
security scanners prefetch links, and a single-use token consumed by a `HEAD`
from a scanner is the most common magic-link production failure.

**`returnTo`** defaults to path-only — a single leading `/`, no backslash, no
`//`, no scheme, no control characters — with `MAGIC_RETURN_TO_ORIGINS` allowing
specific absolute origins. It is validated at request time, stored server-side
with the credential, and **re-validated at redemption**; the redeemed value is
never trusted on its own.

**On success**: `verified_at` is set if unset, `onVerified(identity)` fires, a new
session family is created, and the response redirects to the validated
`returnTo`. There is no consent or double-opt-in machinery here and never will
be — `verified_at` plus the hook is the entire surface products build on.

**Unknown email**: the link is still sent, and the identity is created on
redemption, so sign-up and sign-in are one flow. That is what makes the
identical 202 honest rather than a fiction. No config flag; an invite-only
product changes one line in `magic.ts`.

### Environment variables

Defaults live in the zod schema; each line is marked in `.env.example`.

- `chassis:session` — `JWT_SECRET` (moves from `chassis:jwt`),
  `ACCESS_TOKEN_TTL=15m`, `SESSION_IDLE=30d`, `SESSION_ABSOLUTE=90d`
- `chassis:magic` — `MAGIC_TOKEN_TTL=15m`, `MAGIC_CODE_ATTEMPTS=5`,
  `MAGIC_LINK_BASE_URL=http://localhost:8000`, `MAGIC_RETURN_TO_ORIGINS?`,
  `MAGIC_FROM=no-reply@localhost`, `SMTP_URL?`, `MAGIC_RATE_PER_EMAIL=3`,
  `MAGIC_RATE_PER_IP=20`, `MAGIC_RATE_WINDOW=15m`
- `chassis:password` — `AUTH_DEV_EMAIL`, `AUTH_DEV_PASSWORD` (move from
  `chassis:jwt`)

Durations stay strings in `config`; `src/utils/duration.ts` parses at the point
of use. `config.features.jwt` becomes `config.features.session`.

### Migration list

No migration infrastructure exists (see §1), so these follow the established
hand-run convention: `npx drizzle-kit generate --config src/db/<engine>/drizzle.config.ts`.
Mongo is schemaless and needs indexes only. Tests keep creating tables with raw
SQL, as `src/db/sqlite/users.test.ts:15-24` does.

1. **`users`** — add `verified_at` (nullable timestamp); make `password_hash`
   **nullable**, since a magic-only identity has no password. Existing rows are
   unaffected; products migrating an existing database are pointed at
   `docs/guides/sessions.md`.
2. **`refresh_tokens`** (new) — `id`, `family_id`, `user_id`, `token_hash`
   (unique), `created_at`, `expires_at`, `family_created_at`, `rotated_at`
   (nullable), `revoked_at` (nullable). Indexes on `token_hash` (unique) and
   `family_id`. `family_created_at` is denormalized onto every row so the
   absolute window needs no second table.
3. **`magic_credentials`** (new) — `id`, `email` (indexed), `token_hash`
   (unique), `code_hash`, `attempts` (default 0), `return_to` (nullable),
   `created_at`, `expires_at`, `consumed_at` (nullable), `voided_at` (nullable).
   One row per request holds both credentials, since they share an expiry and
   are voided together.

Both hashes are SHA-256 hex of the raw value; the raw values exist only in the
email. Token lookup is by hash equality in SQL — safe, because the token is
256 bits of entropy — while the 6-digit code is fetched by email and compared
with `timingSafeEqual`, where constant time actually matters.

Expired rows are deleted on read plus a documented manual sweep. There is no
cron: the repo has no scheduler, and adding one for row cleanup would be the
largest new dependency in the change.

## 6. Phases

Each phase is gated: TDD, failing test first, and `npm run verify` plus
`npm run build` green before the next begins.

**P1 — token and code core.** Pure logic, fake clock, no IO. Co-located unit
tests for issue, void, redeem, expiry, latest-wins voiding tokens *and* codes,
the attempt cap, hash round-trips, and a `validateReturnTo` table.

**P2 — endpoints and transport.** Enumeration: 202 bodies byte-identical for
known and unknown emails. Rate-limit buckets independent. **Scanner test: `GET`,
then `HEAD`, then `GET` again, and the token is still redeemable; only `POST`
consumes it.** Open-redirect table covering `https://evil`, `//evil`,
`\/\/evil`, `/\evil`, `%2f%2fevil` and an allowlisted path. Capture transport
receives one email carrying both credentials. Unbound `SmsTransport` is a no-op.

**P3 — sessions.** Rotation on use; reuse revokes the family; idle versus
absolute expiry driven by the fake clock; revoke-all kills every device; logout
is idempotent; access-token expiry via `currentDate`.

**P4 — finish.** Code-fallback e2e (request on client A, redeem the code on A
while the link stays unopened); the scaffold flag and its residue check in CI;
Sentry wiring — auth failures tagged, `identityId` only, never a raw token or
email in an event; docs and README.

## 7. Pipeline

Nothing counts as done until an already-running script enforces it.

| Gate | Change required |
|---|---|
| `npm run verify` (also the pre-commit hook) | None. `vitest.config.ts` already includes `src/**/*.test.ts`; web tests arrive via `verify:web`. The mailpit e2e is `describe.skipIf(!process.env.MAILPIT)` so `verify` stays green without Docker |
| `npm run build` | Must pass with **every** combination pruned — the reason `duration.ts` is its own file and the stores use the flag-table pattern |
| `ci.yml` → `verify` | None. It already runs `node --test cli/*.test.mjs`, the site build and `chassis-mcp` |
| `ci.yml` → new `mail-e2e` job | A mailpit service plus `MAILPIT=1 npm test`. **Every line marked `# chassis:magic`**, so it prunes out of non-magic projects and generated magic apps inherit the job |
| `ci.yml` → `scaffold` | Invocation unchanged; the coverage lands in `scaffold.test.mjs` |
| `published.yml` | None — *because* every marker stays in `.ts`; the residue grep does not cover `.tsx` and a test enforces the invariant instead |
| `docker.yml` | Add a `--auth magic-only --docker` case so the mailpit compose block is exercised |
| `site/build.mjs` | Five new docs each need a `site/pages.mjs` entry |
| `mcp-server` | The schema is catalog-derived, so variants appear free. Assert `list_chassis_options` offers the new variants; extend `chassis_conventions` with the new module names |

`cli/scaffold.test.mjs` gains: `implies` resolvability; `IMPLIED` folded into the
"no file claimed twice" and "declared files exist" tests; `session`, `password`
and `magic` added to the marker-name set and checked against mid-line
`chassis:` text (the `Symbol('chassis:routes')` trap at `src/core/routable.ts:23`);
composition-only variants carved out of "marked-or-has-files"; the no-markers-in-`.tsx`
invariant; and `assertNoModuleResidue(dir, declined)` with a pattern set per
module — symmetric across all three rather than a one-off password grep. The
`SCAFFOLD_BUILD` matrix gains `--auth magic-only --db postgres` and
`--auth password+magic --db sqlite`.

`cli/select.test.mjs`: `GROUPS.auth` goes from four variants to six and the
scripted prompter answers by index, so **existing cases shift and must be
re-pinned**. Add a case per new variant, and assert `IMPLIED` keys are never
prompted.

`docker-compose.yml`: a mailpit service with every line marked `# chassis:magic`
and a marked `SMTP_URL` on the `api` service. It must declare **no named
volume** — the top-level `volumes:` block is entirely `chassis:mongo`-owned so
that it prunes cleanly.

## 8. Conflicts with existing conventions

Flagged rather than silently resolved. Items 1 and 2 were explicitly approved.

1. **A `src/core` edit is required.** `html()` and `seeOther()` are needed for a
   browser confirm page and the post-redeem redirect, and `CLAUDE.md` forbids
   editing `src/core/**` to build a feature. Approved as a deliberate framework
   extension rather than a feature-driven one.
2. **The API will set cookies.** Today it is bearer-only and cookie-free, and
   `web/app/api/session/route.ts` is the sole cookie boundary. This is a new
   convention and it brings CSRF into the API for the first time. Mitigated with
   `SameSite=Lax`, `Secure`, and an `Origin` check on refresh, logout and
   revoke-all only; redeem is exempt because it is self-proving. No new
   dependency — Express 5 has `res.cookie()`.
3. **`rg -i password` cannot return nothing, as literally specified.**
   `POSTGRES_PASSWORD: postgres # chassis:postgres` (`docker-compose.yml:27`) is
   correct to keep, and the string `password` also matches the word
   *passwordless*. CI therefore asserts no hits except `POSTGRES_PASSWORD`, and
   kept docs say "magic link", never "passwordless".
4. **`.md` is excluded from marker pruning on purpose** (`cli/index.mjs:341-342`
   — the docs describe the whole module system, including declined parts). That
   is not changed; password prose and its env rows move into a module-owned doc
   file that is deleted with the module.
5. **`.tsx` is invisible to both the pruner and the residue grep.** Sidestepped
   by keeping every marker in `.ts` and adding a test that enforces it.
6. **Catalog integrity tests** forbid a file claimed twice and require every
   module be marked or have files, so composition-only variants need a carve-out.
7. **No queue exists**, so "enqueue the send" is a detached promise after the
   202. Marked `// ponytail: fire-and-forget; a real queue when delivery needs
   retries or visibility`.
8. **No rate limiter exists**, so it is an in-process fixed-window `Map`, not a
   new dependency. Marked `// ponytail: per-instance; shared store when
   horizontally scaled`.
9. **`nodemailer` is the only new runtime dependency**, pruned with `magic`.
   Hand-rolling SMTP over `node:net` was the alternative and is the wrong kind of
   lazy — dot-stuffing, CRLF handling and TLS are easy to get quietly wrong.
10. **`Auth.controller.ts` is renamed**, and it is referenced by name in
    `AGENTS.md` and three docs.
11. **No duration-parsing precedent exists.** `src/utils/duration.ts` rather than
    a helper inside `config/index.ts`, which would become an unused local once
    both modules are pruned and fail the build.
12. **No migration infrastructure exists**; new tables follow the hand-run
    `drizzle-kit generate` convention.
13. **`users` gains `verified_at` and `password_hash` becomes nullable** — a
    schema change to an existing table. Migrating existing rows is the product's
    concern, documented in `docs/guides/sessions.md`.
14. **`MailTransport` and `SmsTransport` are interfaces with one implementation
    each.** Normally that reads as speculative abstraction; here it is the point.
    Binding an ESP inside Chassis is explicitly out of scope, so the seam *is*
    the feature and every provider stays documentation.

## 9. As built — where it departed from the plan

Seven changes, each forced by something the plan could not have known without
writing the code.

**The password hash moved behind its own store.** The plan kept it on the
identity row, reached through `UserStore`. That leaves the word "password" in
`src/db/users.ts` — a file every local variant keeps — so `--auth magic-only`
could never be clean. As built, `src/db/users.ts` deals only in identities and
`src/db/passwords.ts` owns the credential, with a per-engine implementation
each. `users.password_hash` survives as a marked column in the schema file, so
declining the module drops the column outright.

**`AUTH_DEV_EMAIL` belongs to the session module, not the password module.**
Seeding a development identity is useful without a password; only
`AUTH_DEV_PASSWORD` is password-specific.

**Durations needed a helper, for a formatting reason.** Written inline,
`SESSION_IDLE: z.string().regex(/^\d+[smhd]$/).default('30d'), // chassis:session`
exceeds the print width, and Prettier then splits the chain across four lines —
leaving the marker on the last one, where pruning it would delete `.default(...)`
and break the declaration. `durationSchema()` in `src/utils/duration.ts` keeps
each env line short. This is the same trap the schema files already warn about.

**Three core additions, not two.** `accepted()` joined `html()` and
`seeOther()` — the enumeration-safe request endpoint answers `202`, and the
alternative was abusing `manualError`. `TOO_MANY_REQUESTS` was added to
`ERROR_CODES` for the rate limiter, which `AGENTS.md` explicitly sanctions.
`express.urlencoded` is now mounted in `src/app.ts`, marked `chassis:magic`,
because the API's confirmation page is a plain form and a form posts urlencoded.

**The web session route had to be split — this was a real bug.**
`POST /api/session` proxied to the API's `/auth/login`, which does not exist in
a magic-only project. Sign-in is now per-method (`/api/session/password`,
`/api/session/magic`), and `/api/session` keeps only what they share: turning an
API response into cookies, and signing out.

**A table column cannot carry a marker inside SQL.** `src/db/sqlite/users.test.ts`
creates its table from a `COLUMNS` array rather than one SQL string, so the
optional column sits on its own markable line. A marker inside the template
literal would either be invalid SQL in the template or survive into generated
projects.

**The whole-tree password grep holds, with two named exemptions.**
`docs/modules.md` and `docs/reference/cli.md` describe the scaffolder itself, so
naming a module the reader did not scaffold is their job — the same reason `.md`
is exempt from marker pruning. Everything else, prose included, is scanned. The
check generalized into `assertNoModuleResidue` in `cli/scaffold.test.mjs`, which
holds `magic` and `session` to the same standard rather than special-casing
`password`. It caught the web-route bug above, and eleven pieces of prose that
would have shipped into projects that had pruned the module they described.

### Verified

- `npm run verify`, `npm run build`, `node --test cli/*.test.mjs` (96 passing),
  `npm run check --prefix site` — all green.
- A scaffolded `--auth magic-only --db postgres` project installs, runs its 116
  tests, and builds. `rg -i password` over it returns only `POSTGRES_PASSWORD`
  and the two scaffolder docs.
- The mailpit e2e ran against real SMTP: request → email carrying link and code
  → two GETs and a HEAD leaving the token redeemable → POST redeem → session →
  20-day gap → silent refresh → day 91 → forced re-auth.
