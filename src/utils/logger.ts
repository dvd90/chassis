import winston from 'winston';
import type { Request } from 'express';
import { config } from '../config';

const REDACTED = '[redacted]';

/**
 * Substring matches, because credentials arrive under a dozen spellings —
 * `token`, `refreshToken`, `access_token` all have to go.
 */
const SENSITIVE_SUBSTRINGS = [
  'password',
  'authorization',
  'cookie',
  'secret',
  'token',
  'jwt',
  'apikey',
  'api_key',
  'email'
];

/**
 * Exact matches only. `code` is the six-digit sign-in code, and matching it as
 * a substring would also swallow `statusCode` and `errorCode` — which are the
 * fields you actually want in a log line.
 */
const SENSITIVE_KEYS = ['code', 'otp'];

function isSensitive(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    SENSITIVE_KEYS.includes(lower) ||
    SENSITIVE_SUBSTRINGS.some((needle) => lower.includes(needle))
  );
}

/**
 * ponytail: a key-name denylist, two levels deep. It catches the way secrets
 * actually reach the logger here — named fields in a meta object. If meta ever
 * carries arbitrary nested payloads, the upgrade is a value-shaped scanner
 * (JWT-looking strings, long hex) rather than a deeper walk.
 */
function scrub(value: unknown, depth: number): unknown {
  if (depth === 0 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => scrub(item, depth - 1));

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    out[key] = isSensitive(key) ? REDACTED : scrub(nested, depth - 1);
  }
  return out;
}

/**
 * Strips credentials out of log metadata before any transport sees it.
 *
 * Exported for the test — it is applied to every logger below, so nothing has
 * to remember to call it.
 */
export const redact = winston.format((info) => {
  for (const key of Object.keys(info)) {
    if (key === 'level' || key === 'message') continue;
    info[key] = isSensitive(key) ? REDACTED : scrub(info[key], 2);
  }
  return info;
});

/**
 * The route pattern a request matched — `/auth/magic/:token`, never
 * `/auth/magic/eyJhbGci…`.
 *
 * Magic-link tokens travel in the URL path, so logging `originalUrl` puts live
 * sign-in credentials in the log. The pattern is also the more useful field:
 * every request to one endpoint groups under one string.
 *
 * ponytail: when nothing matched there is no pattern to fall back to, so a 404
 * logs its path with only the query stripped. A credential in the path of a
 * *retired* endpoint still lands in the log. The upgrade is a value-shaped
 * scrubber for path segments (long, high-entropy, JWT-looking), which is worth
 * writing the day a route that carries secrets is renamed.
 */
export function logPath(req: Request): string {
  const pattern = (req.route as { path?: string } | undefined)?.path;
  return pattern ? `${req.baseUrl}${pattern}` : req.originalUrl.split('?')[0];
}

const devFormat = winston.format.combine(
  redact(),
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const extras = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level} ${message}${extras}`;
  })
);

const prodFormat = winston.format.combine(
  redact(),
  winston.format.timestamp(),
  winston.format.json()
);

export const logger = winston.createLogger({
  silent: config.env === 'test',
  level: 'info',
  format: config.env === 'production' ? prodFormat : devFormat,
  transports: [new winston.transports.Console()]
});
