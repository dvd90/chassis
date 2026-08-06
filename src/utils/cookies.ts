import type { Request } from 'express';

/**
 * Read one cookie off the request.
 *
 * ponytail: Express 5 parses no cookies by itself, and the API needs exactly
 * one (the refresh token), so this is cheaper than a cookie-parser
 * dependency. Reach for that library the day a second cookie shows up.
 */
export function readCookie(req: Request, name: string): string | undefined {
  for (const part of req.headers.cookie?.split(';') ?? []) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}
