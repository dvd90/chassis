import type { RequestHandler } from 'express';
import { paymentMiddleware, type Network } from 'x402-express';
import { setPaymentGate } from '../core/payments';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Enabled when X402_PAY_TO is set. Gates every @paidRoute behind an x402
 * payment of the declared price, settled by the x402 facilitator.
 */
export function initX402(): void {
  const payTo = config.x402.payTo as `0x${string}`;
  const network = config.x402.network as Network;
  // One x402 middleware per (price, path) pair — the set is bounded by the
  // number of @paidRoute declarations, so this Map stays small.
  const cache = new Map<string, RequestHandler>();

  setPaymentGate((price) => (req, res, next) => {
    const key = `${price}|${req.path}`;
    const middleware =
      cache.get(key) ??
      paymentMiddleware(payTo, { [req.path]: { price, network } });
    cache.set(key, middleware);
    return middleware(req, res, next);
  });

  logger.info('✅ x402 payments enabled');
}
