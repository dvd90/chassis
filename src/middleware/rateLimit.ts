import type { Request, RequestHandler } from 'express';
import { ERROR_CODES } from '../core';
import { now } from '../utils/clock';
import { seconds } from '../utils/duration';

/**
 * Fixed-window rate limiting, keyed by whatever the caller says.
 *
 * ponytail: in-process counters, so limits are per-instance — two replicas
 * mean twice the allowance. That is the right trade for a template: it needs
 * no Redis, no dependency, and no infrastructure to be useful on day one.
 * Swap the Map for a shared store when you run more than one instance and the
 * limit has to be exact.
 *
 * The clock is injected, so lockout windows are testable without waiting.
 */
export interface RateLimitOptions {
  /** What to count against — an address, an IP, a tenant. */
  key: (req: Request) => string;
  limit: number;
  /** Window length, e.g. '15m'. */
  window: string;
  message?: string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export function rateLimit(options: RateLimitOptions): RequestHandler {
  const buckets = new Map<string, Bucket>();
  const windowMs = seconds(options.window) * 1000;

  return (req, _res, next) => {
    const at = now().getTime();
    const key = options.key(req);
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= at) {
      // ponytail: sweep expired buckets only when the map has grown enough to
      // be worth it, rather than paying for a timer that runs forever.
      if (buckets.size > 10_000) {
        for (const [existing, value] of buckets) {
          if (value.resetAt <= at) buckets.delete(existing);
        }
      }
      buckets.set(key, { count: 1, resetAt: at + windowMs });
      return next();
    }

    if (bucket.count >= options.limit) {
      return req.resHandler.manualError(ERROR_CODES.TOO_MANY_REQUESTS, {
        message: options.message ?? 'Too many requests. Try again shortly.',
        retryAfter: Math.ceil((bucket.resetAt - at) / 1000)
      });
    }

    bucket.count += 1;
    next();
  };
}
