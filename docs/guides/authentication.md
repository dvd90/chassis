# Authentication

`@protectedRoute` marks an endpoint as requiring authentication. _Who_
verifies the request is pluggable: Chassis ships an Auth0 integration,
and swapping in any other provider is one function call.

Until a provider is configured, protected routes answer **501** with a
message explaining exactly what to set — the route is never silently
open.

## Option A — Auth0 (built in)

### 1. Create an API in Auth0

1. Auth0 Dashboard → **Applications → APIs → Create API**
2. Pick any name; set the **Identifier** (this becomes your _audience_),
   e.g. `https://my-api.example.com`
3. Note your tenant domain, e.g. `my-tenant.eu.auth0.com`

### 2. Configure Chassis

```bash
# .env
AUTH0_DOMAIN=my-tenant.eu.auth0.com
AUTH0_AUDIENCE=https://my-api.example.com
```

Restart — you should see `✅ Auth0 authentication enabled`. Both
variables must be set; with either missing the integration stays off.

### 3. Protect a route

```ts
import { protectedRoute } from '../core';

@protectedRoute('post', '/', [validate({ body: createBookSchema })])
async create(req: Request): Promise<Response> {
  return req.resHandler.created(await BookModel.create(req.body));
}
```

Extra middlewares run _after_ auth, so they can trust the request.

### 4. Call it with a token

Get a test token (Auth0 Dashboard → your API → **Test** tab, or client
credentials):

```bash
TOKEN=$(curl -s https://my-tenant.eu.auth0.com/oauth/token \
  -H 'content-type: application/json' \
  -d '{"client_id":"...","client_secret":"...","audience":"https://my-api.example.com","grant_type":"client_credentials"}' \
  | jq -r .access_token)

curl localhost:8000/books -H "authorization: Bearer $TOKEN" \
  -X POST -H 'content-type: application/json' \
  -d '{"title":"Dune","author":"Frank Herbert"}'
```

Missing/invalid tokens get a structured 401 from the central error
handler. To read the token's claims in a handler, use the `auth`
property that `express-oauth2-jwt-bearer` sets on the request
(`req.auth?.payload.sub`, etc.).

## Option B — Local JWT (built in)

Pick `--auth jwt` for self-issued Bearer tokens with no third party. Set a
secret:

```bash
# .env
JWT_SECRET=a-long-random-string
```

Unlike the hosted providers, this one has no user directory behind it — so
Chassis ships the missing half: `src/controllers/Auth.controller.ts` mints
tokens that `src/integrations/jwt.ts` then verifies (HS256, via
[jose](https://github.com/panva/jose)).

```bash
curl localhost:8000/auth/register -H 'content-type: application/json' \
  -d '{"email":"dev@example.com","password":"correct-horse-42"}'
# → 201 { "user": { "id": "1", "email": "dev@example.com" }, "token": "eyJ..." }

curl localhost:8000/auth/login -H 'content-type: application/json' \
  -d '{"email":"dev@example.com","password":"correct-horse-42"}'
# → 200 { "user": {...}, "token": "eyJ..." }
```

Passwords are hashed with **scrypt** from Node's `node:crypto` — a
memory-hard KDF in the standard library, so there is no argon2/bcrypt
dependency and no native build (`src/utils/password.ts`).

### Where users are stored

`src/db/users.ts` resolves the store the same way integrations resolve
themselves — by feature flag, at call time:

| Configured database | Store                                                         |
| ------------------- | ------------------------------------------------------------- |
| SQLite / Postgres   | Drizzle `users` table (`src/db/<db>/users.ts`)                |
| MongoDB             | Mongoose `User` model (`src/db/mongo/users.ts`)               |
| _none_              | in-memory, seeded from `AUTH_DEV_EMAIL` / `AUTH_DEV_PASSWORD` |

Pick a database and the store follows it — no code change. The in-memory
fallback exists so `--auth jwt --db none` still boots and logs in during
development; it is process-local and forgets everything on restart. Add a
database before putting local JWT in front of real users.

With Drizzle, generate the migration for the `users` table before first
use:

```bash
npx drizzle-kit generate --config src/db/sqlite/drizzle.config.ts
```

Tokens are access tokens only, valid for one hour — there is no refresh
rotation. Clients re-authenticate when a token expires; add a refresh
endpoint alongside `/auth/login` if you need sessions to outlive that
without a password prompt.

## Option C — Clerk (built in)

Pick `--auth clerk` to use [Clerk](https://clerk.com). Set the key (Clerk reads
it from the env itself):

```bash
# .env
CLERK_SECRET_KEY=sk_test_...
```

`src/integrations/clerk.ts` registers Clerk's middleware; read the session in a
handler with `getAuth(req)` from `@clerk/express`.

## Option D — any other provider

`@protectedRoute` delegates to whatever middleware chain was registered
with `setAuthProvider()` (see `src/core/auth.ts`). To use your own IdP,
API keys, sessions — anything — register a chain at boot.

Example: simple API-key auth. Create `src/integrations/apiKey.ts`:

```ts
import { RequestHandler } from 'express';
import { setAuthProvider } from '../core/auth';

const checkApiKey: RequestHandler = (req, res, next) => {
  if (req.header('x-api-key') !== process.env.API_KEY) {
    return req.resHandler.wrongToken('Invalid API key');
  }
  next();
};

export function initApiKeyAuth(): void {
  setAuthProvider([checkApiKey]);
}
```

Then register it in `src/integrations/index.ts` behind a feature flag,
exactly like the built-ins (the pattern is documented in
[Modules](../modules.md)). Every `@protectedRoute` in the app now uses
your provider — controllers don't change at all.

## From the browser

If you scaffolded the Next.js front end (`--web`), the same three
providers have a matching web half in `apps/web/auth/providers/`. All of
them do one job — hand `apiFetch` a bearer token for the API — behind one
function, `getAccessToken()`:

| Provider | Web package           | How the token is obtained                                               |
| -------- | --------------------- | ----------------------------------------------------------------------- |
| `jwt`    | _(none)_              | sign-in form → `/api/session` → API `/auth/login` → **httpOnly cookie** |
| `auth0`  | `@auth0/nextjs-auth0` | hosted login → SDK session → `getAccessToken()`                         |
| `clerk`  | `@clerk/nextjs`       | `<SignIn/>` → `auth().getToken()`                                       |

Two notes that cost people hours:

- **Auth0 needs an audience.** `apps/web/auth/providers/auth0.shared.ts`
  passes `authorizationParameters.audience`. Without it Auth0 returns an
  ID token rather than an API access token, and every `@protectedRoute`
  call is rejected. It must match `AUTH0_AUDIENCE` on the API exactly.
- **The local-JWT token never touches client JavaScript.** The form posts
  to a Next route handler, which calls the API server-side and returns the
  token only as an httpOnly cookie — so an injected script cannot read it.

See [Web front end](web.md) for the full picture.

## How it works (and why 501)

Route decorators run at class-definition time, before any integration
has initialized. `requireAuth()` therefore resolves the provider **per
request**, not at decoration time. If nothing registered a provider, the
request is answered with `501 Not Implemented` and a hint — a loud,
obvious failure instead of an accidentally-public endpoint.
