# Payments (x402)

The x402 module (`--x402`) gates routes behind an HTTP 402 payment using the
[x402 protocol](https://www.x402.org) — pay-per-request in stablecoins,
settled by a facilitator. It mirrors auth: a `@paidRoute` decorator plus a
pluggable gate, so payment verification never lives in your controllers.

## Configure

```bash
# .env
X402_PAY_TO=0xYourWalletAddress
X402_NETWORK=base-sepolia          # testnet default; use `base` for mainnet
```

With `X402_PAY_TO` set you'll see `✅ x402 payments enabled` at boot. Unset, a
`@paidRoute` answers `501` with a hint — never accidentally free.

## Gate a route

```ts
import { paidRoute } from '../core';

@paidRoute('get', '/report', '$0.01')
async report(req: Request): Promise<Response> {
  return req.resHandler.ok({ report: buildReport() });
}
```

A caller without a valid payment gets `402 Payment Required` with the payment
details; the x402 client library on their side handles the settlement and
retries. The price string (`'$0.01'`) is USDC.

## How it works

`@paidRoute` uses `requirePayment(price)`, which resolves the registered gate
**per request** (see `src/core/payments.ts`) — so decorators can run before
the integration boots. The x402 integration registers a gate backed by
`x402-express`'s `paymentMiddleware`, keyed to each route's path and price.
Swap in any other provider by calling `setPaymentGate()` from your own
integration; `@paidRoute` doesn't care who settles the payment.
