// Minimal ambient types for x402-express, which only publishes its
// declarations via an ESM `.d.mts` that this project's classic module
// resolution can't reach. Covers just the surface src/integrations/x402.ts
// uses. ponytail: widen if you use more of the x402 API.
declare module 'x402-express' {
  import type { RequestHandler } from 'express';

  export type Network = string;

  export function paymentMiddleware(
    payTo: `0x${string}`,
    routes: Record<string, { price: string; network: Network }>,
    facilitator?: unknown,
    paywall?: unknown
  ): RequestHandler;
}
