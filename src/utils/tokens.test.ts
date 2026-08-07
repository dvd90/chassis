import { describe, expect, it } from 'vitest';
import { hashesEqual, randomCode, randomToken, sha256 } from './tokens';

describe('randomToken', () => {
  it('is 256 bits of URL-safe base64', () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });

  it('does not repeat', () => {
    const tokens = new Set(Array.from({ length: 500 }, randomToken));
    expect(tokens.size).toBe(500);
  });
});

describe('randomCode', () => {
  it('is always six digits, zero-padded', () => {
    for (let i = 0; i < 2000; i++) {
      expect(randomCode()).toMatch(/^\d{6}$/);
    }
  });

  it('can produce a leading-zero code', () => {
    // 1-in-10 per draw, so 200 draws effectively never miss. The padding is
    // the point: `String(randomInt(...))` alone would emit a 5-char code.
    const codes = Array.from({ length: 200 }, randomCode);
    expect(codes.some((code) => code.startsWith('0'))).toBe(true);
  });
});

describe('sha256', () => {
  it('round-trips a known digest', () => {
    expect(sha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('is stable and 64 hex chars', () => {
    const token = randomToken();
    expect(sha256(token)).toBe(sha256(token));
    expect(sha256(token)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('hashesEqual', () => {
  it('matches a hash against itself', () => {
    const token = randomToken();
    expect(hashesEqual(sha256(token), sha256(token))).toBe(true);
  });

  it('rejects a different value', () => {
    expect(hashesEqual(sha256('123456'), sha256('123457'))).toBe(false);
  });

  it('returns false rather than throwing on a length mismatch', () => {
    expect(hashesEqual(sha256('a'), 'ff')).toBe(false);
    expect(hashesEqual('', sha256('a'))).toBe(false);
  });
});
