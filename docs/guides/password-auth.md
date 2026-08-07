# Password sign-in

Email and password, self-issued.

```bash
curl localhost:8000/auth/register -H 'content-type: application/json' \
  -d '{"email":"dev@example.com","password":"correct-horse-42"}'
# → 201 { "user": {...}, "accessToken": "eyJ...", "refreshToken": "...", "expiresIn": 900 }

curl localhost:8000/auth/login -H 'content-type: application/json' \
  -d '{"email":"dev@example.com","password":"correct-horse-42"}'
# → 200 { "user": {...}, "accessToken": "eyJ...", "refreshToken": "...", "expiresIn": 900 }
```

Both return a session rather than a bare token — see [Sessions](sessions.md)
for what to do with the refresh half.

## Hashing

**scrypt**, from Node's `node:crypto` (`src/utils/password.ts`). A memory-hard
KDF in the standard library, so there is no argon2 or bcrypt dependency and no
native build to fail on someone's machine. Stored as
`scrypt$<salt-hex>$<key-hex>`, compared with `timingSafeEqual`.

The minimum length is eight characters, enforced by the zod schema in
`src/controllers/Password.controller.ts`. Change it there and in the matching
`minLength` on the web form.

## Where the hash lives

On the identity row, but reached only through `src/db/passwords.ts` — never
through the identity store itself. `src/db/users.ts` deals in *who someone is*;
this module deals in *one way of proving it*.

That separation is not decoration. It is what allows a project scaffolded
without this module to carry no password code, no `password_hash` column, and
no mention of the word anywhere in its tree — rather than a dead column and a
disabled route.

## Development seeding

| Variable            | Meaning                                                    |
| ------------------- | ---------------------------------------------------------- |
| `AUTH_DEV_EMAIL`    | Seeds one identity in the in-memory store                  |
| `AUTH_DEV_PASSWORD` | Gives that identity a password, hashed lazily on first use |

Only the in-memory store, only when no database is configured, and gone on
restart. It exists so `--db none` still signs in during development.

## Failure modes are indistinguishable on purpose

`POST /auth/login` answers `401` with one message for an unknown address, a
wrong password, and an identity that has no password at all — someone who only
ever signed in another way. One branch, one message; otherwise the endpoint
becomes a way to enumerate who has an account and how they signed up.

## Alongside other sign-in methods

When a project keeps more than one, they share a single identity table and a
single session layer. An identity may have a password, may have been proven
some other way, or both; either route produces the same session. Someone who
never set a password simply has no hash stored, and `/auth/login` refuses them
without saying why.
