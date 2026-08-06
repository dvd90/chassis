import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setClock } from '../utils/clock';
import { resetMemoryMagic } from '../db/memory-magic';
import { resetMemoryUsers } from '../db/memory-users';
import { userStore } from '../db/users';
import {
  issue,
  probe,
  redeemCode,
  redeemToken,
  setOnVerified,
  validateReturnTo
} from './magic';

/**
 * Pure-logic coverage for the credential core: no HTTP, no mail, no database
 * beyond the in-memory stores. Every expiry assertion is driven by the
 * injected clock, which is the whole reason src/utils/clock.ts exists.
 */
let clock = new Date('2026-01-01T12:00:00.000Z');

const advance = (ms: number) => {
  clock = new Date(clock.getTime() + ms);
};

const MINUTE = 60_000;

beforeEach(() => {
  clock = new Date('2026-01-01T12:00:00.000Z');
  setClock(() => clock);
  resetMemoryMagic();
  resetMemoryUsers();
  setOnVerified(() => {});
});

afterEach(() => {
  setClock();
});

describe('issue', () => {
  it('produces a 256-bit token and a six-digit code', async () => {
    const { token, code } = await issue('a@example.com', null);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(code).toMatch(/^\d{6}$/);
  });

  it('is latest-wins: a new request voids the previous token AND code', async () => {
    const first = await issue('a@example.com', null);
    const second = await issue('a@example.com', null);

    expect((await probe(first.token)).status).toBe('used');
    await expect(redeemToken(first.token)).rejects.toThrow(/already been used/);
    await expect(redeemCode('a@example.com', first.code)).rejects.toThrow();

    // The newest pair still works.
    expect((await probe(second.token)).status).toBe('valid');
  });
});

describe('probe', () => {
  it('never consumes the token, however many times it is called', async () => {
    const { token } = await issue('a@example.com', '/dashboard');

    for (let i = 0; i < 5; i++) {
      expect(await probe(token)).toEqual({
        status: 'valid',
        returnTo: '/dashboard'
      });
    }

    // Still redeemable — this is the scanner-prefetch guarantee.
    await expect(redeemToken(token)).resolves.toMatchObject({
      returnTo: '/dashboard'
    });
  });

  it('reports an unknown token as used, not valid', async () => {
    expect(await probe('nope')).toEqual({ status: 'used', returnTo: null });
  });

  it('reports expiry once the TTL has passed', async () => {
    const { token } = await issue('a@example.com', null);

    advance(15 * MINUTE - 1);
    expect((await probe(token)).status).toBe('valid');

    advance(1);
    expect((await probe(token)).status).toBe('expired');
  });
});

describe('redeemToken', () => {
  it('is single use', async () => {
    const { token } = await issue('a@example.com', null);
    await redeemToken(token);
    await expect(redeemToken(token)).rejects.toThrow(/already been used/);
  });

  it('refuses an expired token', async () => {
    const { token } = await issue('a@example.com', null);
    advance(15 * MINUTE);
    await expect(redeemToken(token)).rejects.toThrow(/expired/);
  });

  it('creates the identity, stamps verifiedAt and fires onVerified once', async () => {
    const seen: string[] = [];
    setOnVerified((identity) => {
      seen.push(identity.email);
    });

    const first = await issue('new@example.com', null);
    const { user } = await redeemToken(first.token);

    expect(user.email).toBe('new@example.com');
    expect(seen).toEqual(['new@example.com']);

    const stored = await userStore().findByEmail('new@example.com');
    expect(stored?.verifiedAt).toBe(clock.toISOString());

    // A second sign-in must not re-fire the hook.
    const second = await issue('new@example.com', null);
    await redeemToken(second.token);
    expect(seen).toEqual(['new@example.com']);
  });

  it('survives a throwing onVerified hook', async () => {
    setOnVerified(() => {
      throw new Error('product hook exploded');
    });

    const { token } = await issue('a@example.com', null);
    await expect(redeemToken(token)).resolves.toBeTruthy();
  });
});

describe('redeemCode', () => {
  it('signs in with the correct code', async () => {
    const { code } = await issue('a@example.com', '/welcome');
    const result = await redeemCode('a@example.com', code);
    expect(result.user.email).toBe('a@example.com');
    expect(result.returnTo).toBe('/welcome');
  });

  it('leaves the link unopened — the cross-device case', async () => {
    const { token, code } = await issue('a@example.com', null);
    await redeemCode('a@example.com', code);

    // The pair is spent as a unit: the untouched link dies with the code.
    expect((await probe(token)).status).toBe('used');
  });

  it('voids everything after MAGIC_CODE_ATTEMPTS wrong tries', async () => {
    const { token, code } = await issue('a@example.com', null);

    for (let attempt = 1; attempt <= 5; attempt++) {
      await expect(redeemCode('a@example.com', '000000')).rejects.toThrow();
    }

    // Cap reached: the correct code no longer works, and neither does the link.
    await expect(redeemCode('a@example.com', code)).rejects.toThrow();
    expect((await probe(token)).status).toBe('used');
  });

  it('still accepts the right code before the cap', async () => {
    const { code } = await issue('a@example.com', null);
    for (let attempt = 1; attempt <= 4; attempt++) {
      await expect(redeemCode('a@example.com', '000000')).rejects.toThrow();
    }
    await expect(redeemCode('a@example.com', code)).resolves.toBeTruthy();
  });

  it('gives one indistinguishable error for unknown address and wrong code', async () => {
    await issue('known@example.com', null);

    const unknown = await redeemCode('nobody@example.com', '123456').catch(
      (error: Error) => error.message
    );
    const wrong = await redeemCode('known@example.com', '000000').catch(
      (error: Error) => error.message
    );

    expect(unknown).toBe(wrong);
  });

  it('refuses an expired code', async () => {
    const { code } = await issue('a@example.com', null);
    advance(15 * MINUTE);
    await expect(redeemCode('a@example.com', code)).rejects.toThrow();
  });
});

describe('validateReturnTo', () => {
  it.each([
    ['/dashboard', '/dashboard'],
    ['/a/b?c=d#e', '/a/b?c=d#e'],
    ['/', '/']
  ])('allows the same-origin path %o', (input, expected) => {
    expect(validateReturnTo(input)).toBe(expected);
  });

  it.each([
    'https://evil.example',
    'http://evil.example/x',
    '//evil.example',
    '/\\evil.example',
    '\\/\\/evil.example',
    'javascript:alert(1)',
    'data:text/html,<script>',
    'evil.example',
    '/path\nLocation: https://evil.example',
    '/path\twith-tab',
    '/ leading-space'
  ])('rejects %o', (input) => {
    expect(validateReturnTo(input)).toBeNull();
  });

  it.each([undefined, null, ''])('treats %o as absent', (input) => {
    expect(validateReturnTo(input)).toBeNull();
  });

  it('allows an absolute URL only once its origin is allowlisted', async () => {
    const { config } = await import('../config/index.js');
    expect(validateReturnTo('https://app.example/x')).toBeNull();

    vi.spyOn(config.magicReturnTo, 'origins', 'get').mockReturnValue(
      'https://app.example, https://other.example'
    );
    expect(validateReturnTo('https://app.example/x')).toBe(
      'https://app.example/x'
    );
    expect(validateReturnTo('https://nope.example/x')).toBeNull();
    vi.restoreAllMocks();
  });
});
