import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Express } from 'express';
import { hashPassword, verifyPassword } from '../utils/password';

/**
 * End-to-end check of the local-JWT provider: register → login → call a
 * `@protectedRoute` with the returned token. Backed by the in-memory user
 * store, so it runs with no database configured — the `--auth jwt --db none`
 * combination the scaffolder allows.
 *
 * JWT_SECRET has to exist before src/config parses the environment, so the
 * app is imported dynamically rather than at the top of the file. For the
 * same reason, do not add a static import here for anything that reaches
 * `../config` — it would run before `beforeAll` and read an unset secret.
 */
let app: Express;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-that-is-long-enough-to-sign-with';

  const { createApp } = await import('../app.js');
  const { initJwt } = await import('../integrations/jwt.js');
  const { Routable, protectedRoute } = await import('../core/index.js');

  class SecretController extends Routable {
    constructor() {
      super('/secret-demo');
    }

    @protectedRoute('get', '/')
    async show(req: import('express').Request) {
      return req.resHandler.ok({ secret: true });
    }
  }

  initJwt();
  app = createApp({ extraRoutables: [new SecretController()] });
});

const account = { email: 'Dev@Example.com', password: 'correct-horse-42' };

describe('password hashing', () => {
  it('round-trips a password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct-horse-42');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct-horse-42', hash)).toBe(true);
    expect(await verifyPassword('wrong-horse-42', hash)).toBe(false);
  });

  it('rejects a malformed stored hash instead of throwing', async () => {
    expect(await verifyPassword('whatever', 'not-a-hash')).toBe(false);
  });
});

describe('POST /auth/register', () => {
  it('creates an account, normalizes the email and returns a token', async () => {
    const res = await request(app).post('/auth/register').send(account);
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('dev@example.com');
    expect(typeof res.body.token).toBe('string');
  });

  it('rejects a duplicate email with 409', async () => {
    const res = await request(app).post('/auth/register').send(account);
    expect(res.status).toBe(409);
  });

  it('rejects a short password with a structured 400', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'other@example.com', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.issues[0].part).toBe('body');
  });
});

describe('POST /auth/login', () => {
  it('returns a token that opens a @protectedRoute', async () => {
    const login = await request(app).post('/auth/login').send(account);
    expect(login.status).toBe(200);

    const res = await request(app)
      .get('/secret-demo')
      .set('authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.secret).toBe(true);
  });

  it('rejects a wrong password with 401', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ ...account, password: 'not-the-password' });
    expect(res.status).toBe(401);
  });

  it('answers 401 for an unknown email — same shape as a wrong password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'correct-horse-42' });
    expect(res.status).toBe(401);
  });

  it('refuses a forged token', async () => {
    const res = await request(app)
      .get('/secret-demo')
      .set('authorization', 'Bearer not.a.real.token');
    expect(res.status).toBe(401);
  });
});

describe('user store selection', () => {
  it('falls back to the in-memory store when no database is configured', async () => {
    // The seam in src/db/users.ts resolves per call, by feature flag — with
    // no DB env vars set, that must be the in-memory store.
    const { userStore } = await import('../db/users.js');
    const { memoryUsers } = await import('../db/memory-users.js');
    expect(userStore()).toBe(memoryUsers);
  });
});

describe('when JWT_SECRET is unset', () => {
  it('answers 501 rather than minting an unsigned token', async () => {
    vi.resetModules();
    const secret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    try {
      const { createApp } = await import('../app.js');
      const res = await request(createApp())
        .post('/auth/login')
        .send({ email: 'dev@example.com', password: 'correct-horse-42' });

      expect(res.status).toBe(501);
      expect(res.body.errorId).toBe(1501);
    } finally {
      process.env.JWT_SECRET = secret;
    }
  });
});
