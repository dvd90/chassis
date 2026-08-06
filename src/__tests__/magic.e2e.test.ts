import request from 'supertest';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';

/**
 * The whole flow against real SMTP: request → email in a real inbox → confirm
 * page → redeem → session → a 20-day idle gap → silent refresh → the 91-day
 * cap → forced re-auth.
 *
 * Needs mailpit, so it is opt-in:
 *
 *   docker compose up -d mailpit
 *   MAILPIT=1 npm test
 *
 * Skipped otherwise, which keeps `npm run verify` runnable with nothing
 * installed. CI runs it as its own job.
 */
const MAILPIT_API = process.env.MAILPIT_API ?? 'http://localhost:8025';
const enabled = Boolean(process.env.MAILPIT);

let app: Express;
let setClock: (fn?: () => Date) => void;
let clock = new Date('2026-01-01T00:00:00.000Z');

const advanceDays = (days: number) => {
  clock = new Date(clock.getTime() + days * 86_400_000);
};

interface MailpitMessage {
  ID: string;
  To: { Address: string }[];
}

async function latestEmailFor(address: string): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const res = await fetch(`${MAILPIT_API}/api/v1/messages`);
    const { messages } = (await res.json()) as { messages: MailpitMessage[] };
    const match = messages.find((message) =>
      message.To.some((to) => to.Address === address)
    );

    if (match) {
      const detail = await fetch(`${MAILPIT_API}/api/v1/message/${match.ID}`);
      const { Text } = (await detail.json()) as { Text: string };
      return Text;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`no email for ${address} arrived within 5s`);
}

beforeAll(async () => {
  if (!enabled) return;

  process.env.JWT_SECRET = 'e2e-secret-that-is-long-enough-to-sign-with';
  process.env.SMTP_URL = process.env.SMTP_URL ?? 'smtp://localhost:1025';
  process.env.MAGIC_LINK_BASE_URL = 'http://localhost:8000';
  process.env.SESSION_IDLE = '30d';
  process.env.SESSION_ABSOLUTE = '90d';

  const { createApp } = await import('../app.js');
  const { initJwt } = await import('../integrations/jwt.js');
  ({ setClock } = await import('../utils/clock.js'));

  setClock(() => clock);
  initJwt();
  app = createApp();

  await fetch(`${MAILPIT_API}/api/v1/messages`, { method: 'DELETE' });
});

afterAll(() => {
  if (enabled) setClock();
});

describe.skipIf(!enabled)('magic link over real SMTP', () => {
  it('carries a sign-in from an inbox to a session, and ages it out', async () => {
    const address = 'e2e@example.com';

    // 1. Ask for a link.
    const requested = await request(app)
      .post('/auth/magic/request')
      .send({ email: address, returnTo: '/account' });
    expect(requested.status).toBe(202);

    // 2. One email, carrying both credentials.
    const body = await latestEmailFor(address);
    const token = /\/auth\/magic\/([A-Za-z0-9_-]+)/.exec(body)?.[1];
    const code = /code instead: (\d{6})/.exec(body)?.[1];
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(code).toMatch(/^\d{6}$/);

    // 3. What a mail security scanner does to it. Twice, plus a HEAD.
    expect((await request(app).get(`/auth/magic/${token}`)).status).toBe(200);
    expect((await request(app).head(`/auth/magic/${token}`)).status).toBe(200);
    expect((await request(app).get(`/auth/magic/${token}`)).status).toBe(200);

    // 4. The click. This is the only thing that spends the token.
    const redeemed = await request(app)
      .post('/auth/magic/redeem')
      .set('accept', 'application/json')
      .send({ token });

    expect(redeemed.status).toBe(200);
    expect(redeemed.body.user.email).toBe(address);
    expect(redeemed.body.returnTo).toBe('/account');
    let refreshToken = redeemed.body.refreshToken as string;

    // 5. Twenty days away. The session refreshes without a prompt.
    advanceDays(20);
    const silent = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken });
    expect(silent.status).toBe(200);
    refreshToken = silent.body.refreshToken;

    // Stay active so the idle window never lapses.
    for (const gap of [25, 25]) {
      advanceDays(gap);
      const next = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken });
      expect(next.status).toBe(200);
      refreshToken = next.body.refreshToken;
    }

    // 6. Day 91. The absolute cap ends it regardless.
    advanceDays(21);
    const forced = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken });

    expect(forced.status).toBe(401);
    expect(forced.body.message).toMatch(/maximum age/);
  });
});
