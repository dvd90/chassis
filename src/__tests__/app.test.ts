import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Request, Response } from 'express';
import { createApp } from '../app';
import {
  AppError,
  ERROR_CODES,
  protectedRoute,
  Routable,
  route,
  validate
} from '../core';
import { z } from 'zod';

/** A throwaway controller exercising error paths and validation. */
class DemoController extends Routable {
  constructor() {
    super('/demo');
  }

  @route('get', '/boom')
  async boom(): Promise<never> {
    throw new Error('kaboom');
  }

  @route('get', '/missing')
  async missing(): Promise<never> {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'Widget not found');
  }

  @protectedRoute('get', '/secret')
  async secret(req: Request): Promise<Response> {
    return req.resHandler.ok({ secret: true });
  }

  @route('post', '/items', [
    validate({ body: z.object({ name: z.string().min(2) }) })
  ])
  async create(req: Request): Promise<Response> {
    return req.resHandler.created({ item: req.body });
  }
}

const app = createApp({ extraRoutables: [new DemoController()] });

describe('base routes', () => {
  it('GET / returns the banner', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('chassis');
  });

  it('GET /status returns 200 with uptime', async () => {
    const res = await request(app).get('/status');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('up');
    expect(typeof res.body.uptime).toBe('number');
  });

  it('GET /healthz reports liveness', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('alive');
  });

  it('GET /readyz is ready when no integrations are enabled', async () => {
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
  });
});

describe('call id correlation', () => {
  it('generates an x-call-id response header', async () => {
    const res = await request(app).get('/status');
    expect(res.headers['x-call-id']).toBeTruthy();
  });

  it('propagates an incoming x-call-id', async () => {
    const res = await request(app)
      .get('/status')
      .set('x-call-id', 'test-correlation-42');
    expect(res.headers['x-call-id']).toBe('test-correlation-42');
  });
});

describe('error handling', () => {
  it('returns a structured JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.statusReason).toBe('Not Found');
    expect(res.body.callId).toBeTruthy();
  });

  it('catches thrown async errors with a 500', async () => {
    const res = await request(app).get('/demo/boom');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('kaboom');
    expect(res.body.callId).toBeTruthy();
  });

  it('maps AppError to its status code', async () => {
    const res = await request(app).get('/demo/missing');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Widget not found');
  });

  it('returns 400 for malformed JSON bodies', async () => {
    const res = await request(app)
      .post('/demo/items')
      .set('content-type', 'application/json')
      .send('{"broken');
    expect(res.status).toBe(400);
  });
});

describe('protected routes', () => {
  it('responds 501 when no auth provider is configured', async () => {
    const res = await request(app).get('/demo/secret');
    expect(res.status).toBe(501);
    expect(res.body.message).toMatch(/no auth provider/i);
  });
});

describe('validation', () => {
  it('rejects invalid bodies with a structured issue list', async () => {
    const res = await request(app).post('/demo/items').send({ name: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.issues).toHaveLength(1);
    expect(res.body.issues[0].part).toBe('body');
    expect(res.body.issues[0].path).toBe('name');
  });

  it('accepts valid bodies', async () => {
    const res = await request(app).post('/demo/items').send({ name: 'widget' });
    expect(res.status).toBe(201);
    expect(res.body.item.name).toBe('widget');
  });
});
