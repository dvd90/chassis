import request from 'supertest';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';

/**
 * The session endpoints over HTTP: refresh, logout, revoke-all — including the
 * cookie handling and the same-origin guard, neither of which the unit tests
 * in src/services/session.test.ts can reach.
 */
let app: Express;
let setClock: (fn?: () => Date) => void;
let resetMemoryUsers: () => void;
let resetMemorySessions: () => void;
let startSession: typeof import('../services/session.js').startSession;
let createUser: (email: string) => Promise<{ id: string; email: string }>;

let clock = new Date('2026-01-01T00:00:00.000Z');

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-that-is-long-enough-to-sign-with';
  process.env.SESSION_IDLE = '30d';
  process.env.SESSION_ABSOLUTE = '90d';
  process.env.CORS_ORIGINS = 'https://app.example';

  const { createApp } = await import('../app.js');
  const { initJwt } = await import('../integrations/jwt.js');
  ({ setClock } = await import('../utils/clock.js'));
  ({ resetMemoryUsers } = await import('../db/memory-users.js'));
  ({ resetMemorySessions } = await import('../db/memory-sessions.js'));
  ({ startSession } = await import('../services/session.js'));

  const { userStore } = await import('../db/users.js');
  createUser = (email) => userStore().create(email);

  initJwt();
  app = createApp();
});

afterAll(() => {
  setClock();
  delete process.env.JWT_SECRET;
  delete process.env.CORS_ORIGINS;
});

beforeEach(() => {
  clock = new Date('2026-01-01T00:00:00.000Z');
  setClock(() => clock);
  resetMemoryUsers();
  resetMemorySessions();
});

async function signIn(email = 'a@example.com') {
  return startSession(await createUser(email));
}

describe('POST /auth/refresh', () => {
  it('rotates a token presented in the body', async () => {
    const session = await signIn();
    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: session.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.refreshToken).not.toBe(session.refreshToken);
    expect(res.body.accessToken.split('.')).toHaveLength(3);
    expect(res.body.expiresIn).toBe(900);
  });

  it('rotates a token presented in the cookie', async () => {
    const session = await signIn();
    const res = await request(app)
      .post('/auth/refresh')
      .set('cookie', `chassis_refresh=${session.refreshToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['set-cookie'][0]).toMatch(/^chassis_refresh=/);
  });

  it('401s when nothing is presented', async () => {
    expect((await request(app).post('/auth/refresh')).status).toBe(401);
  });

  it('detects reuse and kills the family', async () => {
    const session = await signIn();
    const rotated = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: session.refreshToken });

    const replay = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: session.refreshToken });
    expect(replay.status).toBe(401);
    expect(replay.body.message).toMatch(/reuse detected/);

    const current = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: rotated.body.refreshToken });
    expect(current.status).toBe(401);
  });

  it('refreshes silently after a 20-day idle gap, then forces re-auth at 91 days', async () => {
    const session = await signIn();
    let token = session.refreshToken;

    const days = (n: number) => {
      clock = new Date(clock.getTime() + n * 86_400_000);
    };

    // Someone who comes back every few weeks: each gap is under SESSION_IDLE,
    // so every refresh succeeds without a sign-in prompt.
    for (const gap of [20, 25, 25]) {
      days(gap);
      const silent = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: token });
      expect(silent.status).toBe(200);
      token = silent.body.refreshToken;
    }

    // Day 91. The token in hand is fresh and well inside its idle window; the
    // absolute cap is what ends the session.
    days(21);
    const forced = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: token });

    expect(forced.status).toBe(401);
    expect(forced.body.message).toMatch(/maximum age/);
  });
});

describe('POST /auth/logout', () => {
  it('revokes the session and is idempotent', async () => {
    const session = await signIn();

    const first = await request(app)
      .post('/auth/logout')
      .send({ refreshToken: session.refreshToken });
    expect(first.status).toBe(204);

    const second = await request(app)
      .post('/auth/logout')
      .send({ refreshToken: session.refreshToken });
    expect(second.status).toBe(204);

    const third = await request(app).post('/auth/logout');
    expect(third.status).toBe(204);

    const refreshed = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: session.refreshToken });
    expect(refreshed.status).toBe(401);
  });

  it('clears the cookie', async () => {
    const res = await request(app).post('/auth/logout');
    expect(res.headers['set-cookie'][0]).toMatch(/^chassis_refresh=;/);
  });
});

describe('POST /auth/revoke-all', () => {
  it('requires authentication', async () => {
    expect((await request(app).post('/auth/revoke-all')).status).toBe(401);
  });

  it('kills every device for the caller', async () => {
    const user = await createUser('multi@example.com');
    const phone = await startSession(user);
    const laptop = await startSession(user);

    const res = await request(app)
      .post('/auth/revoke-all')
      .set('authorization', `Bearer ${laptop.accessToken}`);
    expect(res.status).toBe(204);

    for (const session of [phone, laptop]) {
      const refreshed = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: session.refreshToken });
      expect(refreshed.status).toBe(401);
    }
  });
});

describe('the same-origin guard', () => {
  it('rejects a cross-site browser request', async () => {
    const session = await signIn();
    const res = await request(app)
      .post('/auth/refresh')
      .set('origin', 'https://evil.example')
      .set('sec-fetch-site', 'cross-site')
      .send({ refreshToken: session.refreshToken });

    expect(res.status).toBe(403);
  });

  it('allows an allowlisted origin', async () => {
    const session = await signIn();
    const res = await request(app)
      .post('/auth/refresh')
      .set('origin', 'https://app.example')
      .set('sec-fetch-site', 'cross-site')
      .send({ refreshToken: session.refreshToken });

    expect(res.status).toBe(200);
  });

  it('allows a client that sends no Origin at all', async () => {
    const session = await signIn();
    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: session.refreshToken });

    expect(res.status).toBe(200);
  });
});
