import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Request, Response } from 'express';
import { createApp } from '../app';
import { Routable, paidRoute, setPaymentGate } from '../core';

/**
 * @paidRoute and the payment seam are part of core — present regardless of
 * whether the x402 module is installed (it just registers the real gate).
 */
class PaidController extends Routable {
  constructor() {
    super('/paid-demo');
  }

  @paidRoute('get', '/report', '$0.01')
  async report(req: Request): Promise<Response> {
    return req.resHandler.ok({ report: true });
  }
}

const app = createApp({ extraRoutables: [new PaidController()] });

describe('@paidRoute', () => {
  it('responds 501 when no payment provider is configured', async () => {
    const res = await request(app).get('/paid-demo/report');
    expect(res.status).toBe(501);
    expect(res.body.message).toMatch(/no payment provider/i);
  });

  it('runs the registered gate with the declared price', async () => {
    // A stand-in gate (the x402 integration registers the real one at boot).
    setPaymentGate((price) => (req) => req.resHandler.ok({ price }));
    const res = await request(app).get('/paid-demo/report');
    expect(res.status).toBe(200);
    expect(res.body.price).toBe('$0.01');
  });
});
