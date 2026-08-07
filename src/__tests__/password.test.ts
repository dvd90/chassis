import request from 'supertest';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { hashPassword, verifyPassword } from '../utils/password';

/**
 * Register → sign in → call a `@protectedRoute` with the token that came back.
 * Backed by the in-memory stores, so it runs with no database configured — the
 * `--auth jwt --db none` combination the scaffolder allows.
 *
 * JWT_SECRET has to exist before src/config parses the environment, so the app
 * is imported dynamically. For the same reason, do not add a static import
 * here for anything that reaches `../config`.
 */
let app: Express;
let resetMemoryUsers: () => void;
let resetMemoryPasswords: () => void;
let resetMemorySessions: () => void;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-that-is-long-enough-to-sign-with';

  const { createApp } = await import('../app.js');
  const { initJwt } = await import('../integrations/jwt.js');
  ({ resetMemoryUsers } = await import('../db/memory-users.js'));
  ({ resetMemoryPasswords } = await import('../db/memory-passwords.js'));
  ({ resetMemorySessions } = await import('../db/memory-sessions.js'));

  initJwt();
  app = createApp();
});

afterAll(() => {
  delete process.env.JWT_SECRET;
});

beforeEach(() => {
  resetMemoryUsers();
  resetMemoryPasswords();
  resetMemorySessions();
});

const account = { email: 'Dev@Example.com', password: 'correct-horse-42' };

describe('password hashing', () => {
  it('round-trips a password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct-horse-42');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct-horse-42', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});

describe('POST /auth/register', () => {
  it('creates an account and returns a session', async () => {
    const res = await request(app).post('/auth/register').send(account);

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('dev@example.com');
    expect(res.body.accessToken.split('.')).toHaveLength(3);
    expect(res.body.refreshToken).toBeTruthy();
  });

  it('rejects a duplicate address', async () => {
    await request(app).post('/auth/register').send(account);
    const res = await request(app).post('/auth/register').send(account);

    expect(res.status).toBe(409);
  });

  it('rejects a short password', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'a@example.com', password: 'short' });

    expect(res.status).toBe(400);
  });
});

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/auth/register').send(account);
  });

  it('returns a token that opens a @protectedRoute', async () => {
    const login = await request(app).post('/auth/login').send(account);
    expect(login.status).toBe(200);

    const res = await request(app)
      .post('/auth/revoke-all')
      .set('authorization', `Bearer ${login.body.accessToken}`);

    expect(res.status).toBe(204);
  });

  it('gives the same answer for a wrong password and an unknown address', async () => {
    const wrong = await request(app)
      .post('/auth/login')
      .send({ ...account, password: 'not-the-password' });
    const unknown = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'not-the-password' });

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('refuses an identity that has no password stored', async () => {
    const { userStore } = await import('../db/users.js');
    await userStore().create('no-credential@example.com');

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'no-credential@example.com', password: 'anything-at-all' });

    expect(res.status).toBe(401);
  });
});

describe('a forged token', () => {
  it('does not open a @protectedRoute', async () => {
    const res = await request(app)
      .post('/auth/revoke-all')
      .set('authorization', 'Bearer not.a.token');

    expect(res.status).toBe(401);
  });
});
