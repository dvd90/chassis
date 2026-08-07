import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * The session layer's contract: rotation, reuse detection, and the two windows
 * that bound a session. Every expiry here is driven by the injected clock, so
 * a 91-day-old session is tested in microseconds.
 *
 * Nothing is imported statically — src/config reads the environment at module
 * load, so JWT_SECRET has to be set first.
 */
type SessionModule = typeof import('./session.js');
type ClockModule = typeof import('../utils/clock.js');

let session: SessionModule;
let clockModule: ClockModule;
let resetMemorySessions: () => void;
let resetMemoryUsers: () => void;
let createUser: (email: string) => Promise<{ id: string; email: string }>;

let clock = new Date('2026-01-01T00:00:00.000Z');
const advanceDays = (days: number) => {
  clock = new Date(clock.getTime() + days * 86_400_000);
};

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long';
  process.env.SESSION_IDLE = '30d';
  process.env.SESSION_ABSOLUTE = '90d';

  session = await import('./session.js');
  clockModule = await import('../utils/clock.js');
  ({ resetMemorySessions } = await import('../db/memory-sessions.js'));
  ({ resetMemoryUsers } = await import('../db/memory-users.js'));

  const { userStore } = await import('../db/users.js');
  createUser = (email: string) => userStore().create(email);
});

afterAll(() => {
  clockModule.setClock();
  delete process.env.JWT_SECRET;
  delete process.env.SESSION_IDLE;
  delete process.env.SESSION_ABSOLUTE;
});

beforeEach(() => {
  clock = new Date('2026-01-01T00:00:00.000Z');
  clockModule.setClock(() => clock);
  resetMemorySessions();
  resetMemoryUsers();
});

describe('startSession', () => {
  it('issues an access token and a refresh token', async () => {
    const user = await createUser('a@example.com');
    const result = await session.startSession(user);

    expect(result.accessToken.split('.')).toHaveLength(3);
    expect(result.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.expiresIn).toBe(900);
  });

  it('starts a distinct family per sign-in', async () => {
    const user = await createUser('a@example.com');
    const first = await session.startSession(user);
    const second = await session.startSession(user);

    // Revoking one lineage must not touch the other.
    await session.endSession(first.refreshToken);
    await expect(
      session.refreshSession(second.refreshToken)
    ).resolves.toBeTruthy();
  });
});

describe('refreshSession', () => {
  it('rotates on every use', async () => {
    const user = await createUser('a@example.com');
    const first = await session.startSession(user);

    const second = await session.refreshSession(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);

    const third = await session.refreshSession(second.refreshToken);
    expect(third.refreshToken).not.toBe(second.refreshToken);
  });

  it('detects reuse and revokes the whole family', async () => {
    const user = await createUser('a@example.com');
    const first = await session.startSession(user);
    const second = await session.refreshSession(first.refreshToken);

    // Replaying the spent token is the theft signal.
    await expect(session.refreshSession(first.refreshToken)).rejects.toThrow(
      /reuse detected/
    );

    // ...and it takes the legitimate current token down with it.
    await expect(session.refreshSession(second.refreshToken)).rejects.toThrow(
      /Invalid refresh token/
    );
  });

  it('rejects an unknown token', async () => {
    await expect(session.refreshSession('not-a-token')).rejects.toThrow(
      /Invalid refresh token/
    );
  });

  it('slides the idle window while the session stays in use', async () => {
    const user = await createUser('a@example.com');
    let current = (await session.startSession(user)).refreshToken;

    // Refresh every 20 days for a year: idle never elapses, and the absolute
    // cap is what eventually ends it.
    for (let i = 0; i < 4; i++) {
      advanceDays(20);
      current = (await session.refreshSession(current)).refreshToken;
    }

    advanceDays(20); // day 100 — past SESSION_ABSOLUTE
    await expect(session.refreshSession(current)).rejects.toThrow(
      /maximum age/
    );
  });

  it('expires an idle session after SESSION_IDLE', async () => {
    const user = await createUser('a@example.com');
    const { refreshToken } = await session.startSession(user);

    advanceDays(30);
    await expect(session.refreshSession(refreshToken)).rejects.toThrow(
      /Session expired/
    );
  });

  it('still refreshes silently one day before the idle window closes', async () => {
    const user = await createUser('a@example.com');
    const { refreshToken } = await session.startSession(user);

    advanceDays(29);
    await expect(session.refreshSession(refreshToken)).resolves.toBeTruthy();
  });

  it('forces re-auth at the absolute cap even with a freshly rotated token', async () => {
    const user = await createUser('a@example.com');
    let current = (await session.startSession(user)).refreshToken;

    // Stay signed in normally, never idle for a full 30 days.
    for (const gap of [20, 20, 20, 20, 5]) {
      advanceDays(gap);
      current = (await session.refreshSession(current)).refreshToken;
    }

    advanceDays(6); // day 91, while the token in hand is only 6 days old
    await expect(session.refreshSession(current)).rejects.toThrow(
      /maximum age/
    );
  });
});

describe('endSession', () => {
  it('revokes the family', async () => {
    const user = await createUser('a@example.com');
    const { refreshToken } = await session.startSession(user);

    await session.endSession(refreshToken);
    await expect(session.refreshSession(refreshToken)).rejects.toThrow();
  });

  it('is idempotent, and forgiving of nonsense', async () => {
    const user = await createUser('a@example.com');
    const { refreshToken } = await session.startSession(user);

    await expect(session.endSession(refreshToken)).resolves.toBeUndefined();
    await expect(session.endSession(refreshToken)).resolves.toBeUndefined();
    await expect(session.endSession('unknown')).resolves.toBeUndefined();
    await expect(session.endSession(undefined)).resolves.toBeUndefined();
  });
});

describe('revokeAllSessions', () => {
  it('kills every device for that identity, and nobody else', async () => {
    const alice = await createUser('alice@example.com');
    const bob = await createUser('bob@example.com');

    const phone = await session.startSession(alice);
    const laptop = await session.startSession(alice);
    const bobs = await session.startSession(bob);

    await session.revokeAllSessions(alice.id);

    await expect(session.refreshSession(phone.refreshToken)).rejects.toThrow();
    await expect(session.refreshSession(laptop.refreshToken)).rejects.toThrow();
    await expect(session.refreshSession(bobs.refreshToken)).resolves.toBeTruthy();
  });
});

describe('access token', () => {
  it('carries sub, sid and clock-driven iat/exp', async () => {
    const user = await createUser('a@example.com');
    const { accessToken } = await session.startSession(user);

    const claims = JSON.parse(
      Buffer.from(accessToken.split('.')[1], 'base64url').toString()
    ) as { sub: string; sid: string; iat: number; exp: number; email: string };

    const expected = Math.floor(clock.getTime() / 1000);
    expect(claims.sub).toBe(user.id);
    expect(claims.email).toBe('a@example.com');
    expect(claims.sid).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(claims.iat).toBe(expected);
    expect(claims.exp).toBe(expected + 900);
  });

  it('is verifiable now and expired 15 minutes later — via the fake clock', async () => {
    const user = await createUser('a@example.com');
    const { accessToken } = await session.startSession(user);
    const { jwtVerify } = await import('jose');
    const key = session.signingKey();

    await expect(
      jwtVerify(accessToken, key, { currentDate: clock })
    ).resolves.toBeTruthy();

    const later = new Date(clock.getTime() + 15 * 60_000 + 1000);
    await expect(
      jwtVerify(accessToken, key, { currentDate: later })
    ).rejects.toThrow();
  });
});
