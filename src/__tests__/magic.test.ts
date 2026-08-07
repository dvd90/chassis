import request from 'supertest';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Express } from 'express';

/**
 * The magic-link endpoints end to end, over HTTP, against the in-memory
 * stores and a capture mail transport.
 *
 * JWT_SECRET has to exist before src/config parses the environment, so every
 * module that reaches `../config` is imported dynamically. Do not add a static
 * import here for anything that does.
 */
type MailMessage = import('../mail/index.js').MailMessage;

let app: Express;
let inbox: MailMessage[] = [];
let setClock: (fn?: () => Date) => void;
let resetMemoryMagic: () => void;
let resetMemoryUsers: () => void;
let resetMemorySessions: () => void;

let clock = new Date('2026-01-01T00:00:00.000Z');

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-that-is-long-enough-to-sign-with';
  process.env.MAGIC_TOKEN_TTL = '15m';
  process.env.MAGIC_CODE_ATTEMPTS = '5';
  process.env.MAGIC_LINK_BASE_URL = 'https://api.example';

  const { createApp } = await import('../app.js');
  const { initJwt } = await import('../integrations/jwt.js');
  const { setMailTransport } = await import('../mail/index.js');
  ({ setClock } = await import('../utils/clock.js'));
  ({ resetMemoryMagic } = await import('../db/memory-magic.js'));
  ({ resetMemoryUsers } = await import('../db/memory-users.js'));
  ({ resetMemorySessions } = await import('../db/memory-sessions.js'));

  setMailTransport({
    async send(message) {
      inbox.push(message);
    }
  });

  initJwt();
  app = createApp();
});

afterAll(async () => {
  const { setMailTransport } = await import('../mail/index.js');
  setMailTransport();
  setClock();
  delete process.env.JWT_SECRET;
  delete process.env.MAGIC_LINK_BASE_URL;
});

beforeEach(() => {
  // Move past every rate-limit window. The limiter reads the injected clock,
  // so this resets the buckets without any sleeping or special-casing.
  clock = new Date(clock.getTime() + 60 * 60_000);
  setClock(() => clock);
  inbox = [];
  resetMemoryMagic();
  resetMemoryUsers();
  resetMemorySessions();
});

/** POST a request and wait for the detached delivery to land. */
async function requestLink(email: string, returnTo?: string) {
  const res = await request(app)
    .post('/auth/magic/request')
    .send({ email, ...(returnTo === undefined ? {} : { returnTo }) });

  await vi.waitFor(() => expect(inbox.length).toBeGreaterThan(0));
  const body = inbox[inbox.length - 1].text;
  const token = /\/auth\/magic\/([A-Za-z0-9_-]+)/.exec(body)?.[1];
  const code = /code instead: (\d{6})/.exec(body)?.[1];

  return { res, token: token as string, code: code as string };
}

describe('POST /auth/magic/request', () => {
  it('answers 202 with a byte-identical body for known and unknown addresses', async () => {
    await requestLink('known@example.com');
    const { token } = await requestLink('known@example.com');
    await request(app).post('/auth/magic/redeem').send({ token });

    const known = await request(app)
      .post('/auth/magic/request')
      .send({ email: 'known@example.com' });
    const unknown = await request(app)
      .post('/auth/magic/request')
      .send({ email: 'nobody-at-all@example.com' });

    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    // Byte-for-byte, not merely deep-equal: no field order, no whitespace,
    // and no length difference to measure.
    expect(known.text).toBe(unknown.text);
  });

  it('sends one email carrying both the link and the code', async () => {
    const { token, code } = await requestLink('a@example.com');

    expect(inbox).toHaveLength(1);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(code).toMatch(/^\d{6}$/);
    expect(inbox[0].to).toBe('a@example.com');
    expect(inbox[0].html).toContain(`https://api.example/auth/magic/${token}`);
    expect(inbox[0].html).toContain(code);
  });

  it('rejects a malformed address before doing anything', async () => {
    const res = await request(app)
      .post('/auth/magic/request')
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(inbox).toHaveLength(0);
  });
});

describe('rate limiting', () => {
  it('limits per address, and the bucket is that address alone', async () => {
    for (let i = 0; i < 3; i++) {
      const ok = await request(app)
        .post('/auth/magic/request')
        .send({ email: 'target@example.com' });
      expect(ok.status).toBe(202);
    }

    const blocked = await request(app)
      .post('/auth/magic/request')
      .send({ email: 'target@example.com' });
    expect(blocked.status).toBe(429);

    // A different address is untouched — separate buckets, not one shared
    // counter.
    const other = await request(app)
      .post('/auth/magic/request')
      .send({ email: 'someone-else@example.com' });
    expect(other.status).toBe(202);
  });

  it('limits per IP across many different addresses', async () => {
    // Under the per-address cap every time, so only the IP bucket can stop it.
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      const res = await request(app)
        .post('/auth/magic/request')
        .send({ email: `user${i}@example.com` });
      statuses.push(res.status);
    }

    expect(statuses.filter((s) => s === 202)).toHaveLength(20);
    expect(statuses[20]).toBe(429);
  });
});

describe('GET /auth/magic/:token — the scanner guarantee', () => {
  it('does not consume the token on GET or HEAD, however many times', async () => {
    const { token } = await requestLink('a@example.com');

    // Exactly what a mail security scanner does to every link it sees.
    expect((await request(app).get(`/auth/magic/${token}`)).status).toBe(200);
    expect((await request(app).head(`/auth/magic/${token}`)).status).toBe(200);
    expect((await request(app).get(`/auth/magic/${token}`)).status).toBe(200);

    // Still redeemable afterwards — this is the whole point.
    const redeemed = await request(app)
      .post('/auth/magic/redeem')
      .set('accept', 'application/json')
      .send({ token });

    expect(redeemed.status).toBe(200);
    expect(redeemed.body.user.email).toBe('a@example.com');
  });

  it('renders a confirm page with a POST form, not a link', async () => {
    const { token } = await requestLink('a@example.com');
    const res = await request(app).get(`/auth/magic/${token}`);

    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('<form method="post" action="/auth/magic/redeem"');
    expect(res.text).toContain(token);
  });

  it('serves JSON to an API client', async () => {
    const { token } = await requestLink('a@example.com', '/dashboard');
    const res = await request(app)
      .get(`/auth/magic/${token}`)
      .set('accept', 'application/json');

    expect(res.body).toEqual({ status: 'valid', returnTo: '/dashboard' });
  });

  it('reports a spent token as used', async () => {
    const { token } = await requestLink('a@example.com');
    await request(app).post('/auth/magic/redeem').send({ token });

    const res = await request(app)
      .get(`/auth/magic/${token}`)
      .set('accept', 'application/json');

    expect(res.body.status).toBe('used');
  });
});

describe('POST /auth/magic/redeem', () => {
  it('is single use', async () => {
    const { token } = await requestLink('a@example.com');
    expect((await request(app).post('/auth/magic/redeem').send({ token })).status).toBe(303);

    const second = await request(app).post('/auth/magic/redeem').send({ token });
    expect(second.status).toBe(401);
  });

  it('sets an httpOnly, SameSite=Lax refresh cookie scoped to /auth', async () => {
    const { token } = await requestLink('a@example.com');
    const res = await request(app).post('/auth/magic/redeem').send({ token });

    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/^chassis_refresh=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/auth/i);
  });

  it('redirects to a validated returnTo', async () => {
    const { token } = await requestLink('a@example.com', '/dashboard');
    const res = await request(app).post('/auth/magic/redeem').send({ token });

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/dashboard');
  });
});

describe('open redirect', () => {
  it.each([
    'https://evil.example/steal',
    '//evil.example',
    '/\\evil.example',
    '\\/\\/evil.example',
    'javascript:alert(1)',
    'http://evil.example'
  ])('never redirects to %o', async (returnTo) => {
    const { token } = await requestLink('a@example.com', returnTo);

    const probe = await request(app)
      .get(`/auth/magic/${token}`)
      .set('accept', 'application/json');
    expect(probe.body.returnTo).toBeNull();

    const res = await request(app).post('/auth/magic/redeem').send({ token });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/');
  });

  it('does allow an ordinary same-origin path', async () => {
    const { token } = await requestLink('a@example.com', '/app/settings');
    const res = await request(app).post('/auth/magic/redeem').send({ token });
    expect(res.headers.location).toBe('/app/settings');
  });
});

describe('POST /auth/magic/code', () => {
  it('signs in on the requesting device while the link sits unopened', async () => {
    const { token, code } = await requestLink('a@example.com');

    const res = await request(app)
      .post('/auth/magic/code')
      .set('accept', 'application/json')
      .send({ email: 'a@example.com', code });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('a@example.com');
    expect(res.body.accessToken.split('.')).toHaveLength(3);

    // The untouched link died with the code it came with.
    const probe = await request(app)
      .get(`/auth/magic/${token}`)
      .set('accept', 'application/json');
    expect(probe.body.status).toBe('used');
  });

  it('voids everything after the attempt cap', async () => {
    const { code } = await requestLink('a@example.com');

    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await request(app)
        .post('/auth/magic/code')
        .send({ email: 'a@example.com', code: '000000' });
      expect(res.status).toBe(401);
    }

    const withRightCode = await request(app)
      .post('/auth/magic/code')
      .send({ email: 'a@example.com', code });
    expect(withRightCode.status).toBe(401);
  });
});

describe('the session it establishes', () => {
  it('opens a @protectedRoute with the access token', async () => {
    const { token } = await requestLink('a@example.com');
    const redeemed = await request(app)
      .post('/auth/magic/redeem')
      .set('accept', 'application/json')
      .send({ token });

    const res = await request(app)
      .post('/auth/revoke-all')
      .set('authorization', `Bearer ${redeemed.body.accessToken}`);

    expect(res.status).toBe(204);
  });
});
