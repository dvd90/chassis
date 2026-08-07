# Sessions

However a project signs people in, it shares one session layer. Signing in
returns two tokens:

| Token             | Lives                       | Used for                          |
| ----------------- | --------------------------- | --------------------------------- |
| **Access token**  | 15 minutes                  | `Authorization: Bearer` on the API |
| **Refresh token** | `SESSION_IDLE`, sliding     | Getting the next access token      |

```
POST /auth/refresh     → new access token, and a NEW refresh token
POST /auth/logout      → revoke this session. Idempotent.
POST /auth/revoke-all  → revoke every session for this identity
```

Browsers get the refresh token as an httpOnly, `SameSite=Lax` cookie scoped to
`/auth`. API clients get it in the response body and send it back the same way.
Both paths work; neither is privileged.

## Rotation and reuse detection

The refresh token changes on **every** use. The one you presented is marked
spent, and a fresh one comes back.

That matters because of what happens when a spent token shows up again. Either
a client replayed it, or somebody stole it — and from the server's position
those are indistinguishable. So it assumes the worse and revokes the entire
**family**: every token descended from that sign-in, including the legitimate
one the real user is holding. They sign in again; the thief gets nothing.

This is the only mechanism that catches a stolen refresh token at all. Without
rotation, a copied token works quietly until it expires.

```
sign in ──► A
            └─ refresh(A) ──► B          A marked spent
                              └─ refresh(B) ──► C
            refresh(A) again ──► ✗ 401, family {A,B,C} revoked
```

## The two windows

| Variable           | Default | Bounds                                        |
| ------------------ | ------- | --------------------------------------------- |
| `SESSION_IDLE`     | `30d`   | Time since the last refresh — renewed on each |
| `SESSION_ABSOLUTE` | `90d`   | Time since the sign-in itself — never renewed |

Come back inside `SESSION_IDLE` and the session refreshes silently, forever —
until `SESSION_ABSOLUTE`, which nothing resets. At 90 days everyone signs in
again, however active they were. That cap is the point: it puts a ceiling on
how long a compromise nobody noticed can last.

Both are evaluated against an injected clock (`src/utils/clock.ts`), never
`new Date()`. That is what lets `src/services/session.test.ts` prove the
91-day behaviour in microseconds instead of waiting a quarter.

## Storage

`refresh_tokens` is a credentials table: only the SHA-256 of each token is
stored, so a database dump cannot be replayed. Rows carry `family_id`,
`rotated_at` and `revoked_at`, plus a denormalized `family_created_at` so the
absolute window needs no second table.

Expired rows are cleaned up on read. There is no scheduled sweep — Chassis has
no job runner, and adding one to delete rows would be the largest dependency in
the module. If a long-lived deployment accumulates dead rows faster than you
like, a periodic `delete from refresh_tokens where expires_at < now()` is the
whole fix.

## CSRF

The refresh cookie is ambient credentials, which is what CSRF exploits, so
`/auth/refresh`, `/auth/logout` and `/auth/revoke-all` sit behind a
same-origin check on top of `SameSite=Lax`. A request with no `Origin` header
is allowed through: that is a non-browser client, which sends no cookie it did
not choose to send.

Endpoints whose credential travels in the URL are deliberately exempt: there
the token *is* the credential, and it may well arrive by a cross-site
navigation by design — a same-origin check would break the very feature it was
meant to protect.

## Migrating an existing database

The `users` table gained `verified_at`, and any credential column it carries
became nullable. Existing rows are unaffected and no backfill is needed —
whatever an identity already had, it keeps, and `verified_at` stays null until
the address is proven. `refresh_tokens` is new. Generate the migration the
usual way:

```bash
npx drizzle-kit generate --config src/db/postgres/drizzle.config.ts
```
