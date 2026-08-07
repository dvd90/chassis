import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Request, Response } from 'express';
import { createApp } from '../app';
import { ERROR_CODES, Routable, route } from '../core';
import { logger } from '../utils/logger';

/**
 * The unit tests in src/utils/logger.test.ts prove the format and the path
 * helper in isolation. This one proves they are actually wired: a real request
 * carrying a credential in the URL, through the real app, and nothing
 * sensitive comes out of the real logger.
 *
 * That is the failure this guards against — not a broken redactor, but a
 * correct redactor nobody plugged in.
 */
class SecretController extends Routable {
  constructor() {
    super('/probe');
  }

  @route('get', '/:token')
  async show(req: Request): Promise<Response> {
    return req.resHandler.ok({ seen: true });
  }

  /** A handler attaching context to an error — the `...extra` spread path. */
  @route('post', '/credentials')
  async credentials(req: Request): Promise<Response> {
    return req.resHandler.manualError(ERROR_CODES.BAD_REQUEST, {
      email: 'user@example.com',
      password: 'hunter2'
    });
  }
}

const app = createApp({ extraRoutables: [new SecretController()] });

let lines: string[];

/**
 * Winston types `Transport.log` as an optional overloaded method, which spying
 * on resolves to `never`. The runtime contract is stable and simple, so narrow
 * it to that rather than fight the declaration.
 */
type Writable = {
  log: (info: Record<symbol, unknown>, next: () => void) => void;
};

beforeEach(() => {
  lines = [];
  // The Console transport is where a log line actually becomes output, so it
  // is the honest place to read: whatever arrives here is what would be
  // written. Silenced in tests by default — turn it on and swallow the write.
  logger.silent = false;
  vi.spyOn(
    logger.transports[0] as unknown as Writable,
    'log'
  ).mockImplementation((info, next) => {
    lines.push(String(info[Symbol.for('message')]));
    next();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  logger.silent = true;
});

const logged = () => lines.join('\n');

// A generous timeout, not because these are slow — they are milliseconds —
// but because src/jobs/run.test.ts spawns real processes alongside them, and a
// starved two-core runner should not turn that into a red build. A genuine
// redaction failure fails on the assertion, long before this.
describe('request logging', { timeout: 20_000 }, () => {
  it('never writes a token that travelled in the URL path', async () => {
    await request(app).get('/probe/LEAKY-TOKEN-1234').expect(200);

    expect(logged()).not.toContain('LEAKY-TOKEN-1234');
    expect(logged()).toContain('/probe/:token');
  });

  it('never writes a query string', async () => {
    await request(app)
      .get('/probe/LEAKY-TOKEN-1234?next=/account&code=778899')
      .expect(200);

    expect(logged()).not.toContain('778899');
    expect(logged()).not.toContain('next=');
  });

  it('strips the query off an unmatched path too', async () => {
    await request(app).get('/nope?token=LEAKY-TOKEN-1234').expect(404);

    expect(logged()).not.toContain('LEAKY-TOKEN-1234');
    expect(logged()).toContain('/nope');
  });

  it('redacts credentials a handler puts in the error payload', async () => {
    await request(app).post('/probe/credentials').expect(400);

    expect(logged()).not.toContain('hunter2');
    expect(logged()).not.toContain('user@example.com');
    expect(logged()).toContain('[redacted]');
  });

  it('still logs the fields an operator needs', async () => {
    await request(app).get('/probe/LEAKY-TOKEN-1234').expect(200);

    expect(logged()).toContain('callId');
    expect(logged()).toContain('GET');
    expect(logged()).toContain('200');
  });
});
