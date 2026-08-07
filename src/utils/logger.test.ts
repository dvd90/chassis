import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { logPath, redact } from './logger';

/**
 * The logger is the last place a credential passes through before it is
 * durable, so these two guards are the ones worth having: metadata is scrubbed
 * by key name, and a URL is logged as its route pattern rather than its
 * concrete path — magic-link tokens travel in the path.
 */
const scrub = (meta: Record<string, unknown>) =>
  redact().transform({ level: 'info', message: 'test', ...meta }) as Record<
    string,
    unknown
  >;

const asRequest = (partial: Partial<Request>) => partial as Request;

describe('redact', () => {
  it('masks credentials by key name, whatever they are spelled', () => {
    const out = scrub({
      token: 'abc',
      refreshToken: 'def',
      access_token: 'ghi',
      authorization: 'Bearer x',
      cookie: 'session=1',
      password: 'hunter2',
      email: 'user@example.com',
      code: '123456'
    });

    for (const key of [
      'token',
      'refreshToken',
      'access_token',
      'authorization',
      'cookie',
      'password',
      'email',
      'code'
    ]) {
      expect(out[key], key).toBe('[redacted]');
    }
  });

  it('leaves the fields a log line exists for', () => {
    const out = scrub({
      status: 404,
      statusCode: 500,
      errorCode: 'E_NOPE',
      errorId: 'not-found',
      callId: 'abc-123',
      method: 'GET',
      endpoint: '/auth/magic/:token'
    });

    expect(out).toMatchObject({
      status: 404,
      statusCode: 500,
      errorCode: 'E_NOPE',
      errorId: 'not-found',
      callId: 'abc-123',
      method: 'GET',
      endpoint: '/auth/magic/:token'
    });
  });

  it('reaches into nested metadata and arrays', () => {
    const out = scrub({
      user: { id: 7, email: 'user@example.com' },
      issues: [{ path: 'body.password', password: 'hunter2' }]
    });

    expect(out.user).toEqual({ id: 7, email: '[redacted]' });
    expect(out.issues).toEqual([
      { path: 'body.password', password: '[redacted]' }
    ]);
  });

  it('never touches the message itself — the dev mail transport needs it', () => {
    const out = redact().transform({
      level: 'info',
      message: '📧 mail to user@example.com — Your sign-in link'
    });

    expect(out).toMatchObject({
      message: '📧 mail to user@example.com — Your sign-in link'
    });
  });
});

describe('logPath', () => {
  it('logs the matched pattern, not the token in the path', () => {
    const path = logPath(
      asRequest({
        baseUrl: '/auth/magic',
        route: { path: '/:token' },
        originalUrl: '/auth/magic/eyJhbGciOiJIUzI1NiJ9.secret'
      })
    );

    expect(path).toBe('/auth/magic/:token');
    expect(path).not.toContain('secret');
  });

  it('falls back to a query-stripped path when nothing matched', () => {
    expect(
      logPath(asRequest({ originalUrl: '/nope?token=leaky&next=/account' }))
    ).toBe('/nope');
  });
});
