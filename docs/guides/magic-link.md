# Magic link

Sign in with an emailed link — no secret to remember, nothing to reset.

Every email carries **two** credentials for the same sign-in:

- a **link**, which is the normal path, and
- a **six-digit code**, which is what makes the flow work across devices.

That second one is not a lesser fallback. Someone asks for a link on a laptop
and opens their mail on a phone; without a code, the laptop tab they are
waiting on can never finish. With one, they type six digits and carry on.

## The flow

```
POST /auth/magic/request  {email, returnTo?}   → 202, identical every time
        ↓  (email arrives with link + code)
GET  /auth/magic/:token                        → confirm page. Consumes nothing.
POST /auth/magic/redeem   {token}              → session, redirect to returnTo
   or
POST /auth/magic/code     {email, code}        → same session, same outcome
```

## Why the confirmation page exists

`GET` and `HEAD` never spend a token. Corporate mail security scanners —
Outlook SafeLinks and its many equivalents — fetch every link in every message
before a human sees it. A single-use token consumed by a scanner is the single
most common way a magic-link implementation breaks in production, and it fails
in the worst way: it works for you and mysteriously never works for the
customer whose IT department bought a security product.

So the link only *shows* a page. Redemption happens on a user gesture, which
is a `POST`. That is the whole reason for the extra click.

With `--web`, `MAGIC_LINK_BASE_URL` can point at the Next.js app, which serves
its own confirmation page at `/auth/magic/[token]`. Without it, the API serves
a minimal self-contained one — no JavaScript required, since it is a form.

## Configuration

| Variable                  | Default                 | Meaning                                          |
| ------------------------- | ----------------------- | ------------------------------------------------ |
| `MAGIC_TOKEN_TTL`         | `15m`                   | Lifetime of both the link and the code           |
| `MAGIC_CODE_ATTEMPTS`     | `5`                     | Wrong codes before everything for that address is voided |
| `MAGIC_LINK_BASE_URL`     | `http://localhost:8000` | Origin the emailed link points at                |
| `MAGIC_RETURN_TO_ORIGINS` | _(unset)_               | Comma-separated origins allowed as absolute `returnTo` |
| `MAGIC_FROM`              | `no-reply@localhost`    | Sender address                                   |
| `SMTP_URL`                | _(unset)_               | SMTP transport; unset logs the email instead     |

Rate limits are constants rather than variables — 3 requests per address and 20
per IP, each per 15 minutes, in separate buckets. One attacker enumerating many
addresses from one IP and another hammering a single address are different
attacks, and a single limit cannot catch both.

## What it guarantees

- **It will not tell you who has an account.** `POST /auth/magic/request`
  answers `202` with a byte-identical body for every address, and answers
  *before* it looks anything up — so the reply cannot be timed either.
- **Latest wins.** Asking for a new link voids every outstanding link *and*
  code for that address, so a forwarded old email is useless.
- **Nothing is stored in the clear.** The table is a credentials table: only
  SHA-256 digests of the token and the code are written. The raw values exist
  only in the email.
- **The code is compared in constant time**, and capped at
  `MAGIC_CODE_ATTEMPTS` wrong tries — after which the link dies too. Someone
  guessing six digits does not get to keep the link that came with them.
- **`returnTo` cannot be turned into an open redirect.** It is validated when
  the link is issued, stored server-side, and validated *again* at redemption.
  The default policy is same-origin paths only; absolute URLs need their origin
  listed in `MAGIC_RETURN_TO_ORIGINS`. A value posted back by the browser is
  never trusted — a redemption endpoint that trusts one is the classic hole.

## The verification hook

Redeeming proves the address. The first time that happens, `verified_at` is
stamped on the identity and one hook fires:

```ts
import { setOnVerified } from './services/magic';

setOnVerified(async (identity) => {
  await analytics.track('email_verified', { id: identity.id });
});
```

That is the entire extension surface, deliberately. Marketing consent, double
opt-in state machines, welcome sequences and GDPR capture copy are product
concerns with product-specific legal requirements; Chassis holds no opinion and
no state about any of them. It tells you an address was proven, and gets out of
the way. A hook that throws is logged and ignored — a failing product
integration must not cost someone their sign-in.

## Delivery

Email goes out through the `MailTransport` seam, and the code can optionally go
out by SMS through `SmsTransport`. Chassis binds no provider for either. See
[Transports](transports.md).

## Trying it locally

```bash
docker compose up -d mailpit          # SMTP on 1025, web inbox on 8025
SMTP_URL=smtp://localhost:1025 npm run dev

curl localhost:8000/auth/magic/request \
  -H 'content-type: application/json' \
  -d '{"email":"dev@example.com","returnTo":"/account"}'
# → 202 {"status":"sent","message":"If that address can sign in, a link is on its way."}
```

Open <http://localhost:8025> and the message is there, link and code both.
With no `SMTP_URL` set, the whole email is written to the log instead — enough
to finish a sign-in from a terminal with nothing installed.
