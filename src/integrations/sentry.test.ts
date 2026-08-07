import * as Sentry from '@sentry/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { beginCheckIn, captureException, initSentry } from './sentry';

/**
 * Sentry is mocked wholesale: what matters here is the shape of the calls
 * Chassis makes, not what the SDK does with them. Two things can silently go
 * wrong — a release that does not match the uploaded source maps (minified
 * traces forever) and a check-in that never closes (a permanently "running"
 * job in the Crons dashboard) — and neither shows up in any other test.
 */
vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureCheckIn: vi.fn(() => 'check-in-id')
}));

// Hoisted so the config mock below can close over it, then mutated per test —
// cheaper and less brittle than resetting modules to re-read the environment.
const mocked = vi.hoisted(() => ({
  config: {
    env: 'test',
    sentry: { dsn: 'https://key@example.ingest.sentry.io/1', release: '' }
  }
}));

vi.mock('../config', () => mocked);

beforeEach(() => {
  vi.clearAllMocks();
  mocked.config.sentry.release = '';
});

describe('initSentry', () => {
  it('tags the release so uploaded source maps resolve', () => {
    mocked.config.sentry.release = 'abc123';
    initSentry();

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://key@example.ingest.sentry.io/1',
        environment: 'test',
        release: 'abc123'
      })
    );
  });

  it('still initializes when no release is configured', () => {
    initSentry();

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ release: '' })
    );
  });
});

describe('beginCheckIn', () => {
  it('opens in_progress immediately, before the job runs', () => {
    beginCheckIn('nightly');

    expect(Sentry.captureCheckIn).toHaveBeenCalledTimes(1);
    expect(Sentry.captureCheckIn).toHaveBeenCalledWith({
      monitorSlug: 'nightly',
      status: 'in_progress'
    });
  });

  it('closes ok against the same check-in id', () => {
    beginCheckIn('nightly').ok();

    expect(Sentry.captureCheckIn).toHaveBeenLastCalledWith({
      checkInId: 'check-in-id',
      monitorSlug: 'nightly',
      status: 'ok'
    });
  });

  it('closes error against the same check-in id', () => {
    beginCheckIn('nightly').error();

    expect(Sentry.captureCheckIn).toHaveBeenLastCalledWith({
      checkInId: 'check-in-id',
      monitorSlug: 'nightly',
      status: 'error'
    });
  });

  it('keeps each job on its own monitor', () => {
    beginCheckIn('nightly').ok();
    beginCheckIn('hourly').ok();

    const slugs = vi
      .mocked(Sentry.captureCheckIn)
      .mock.calls.map(
        ([call]) => (call as { monitorSlug: string }).monitorSlug
      );

    expect(new Set(slugs)).toEqual(new Set(['nightly', 'hourly']));
  });
});

describe('captureException', () => {
  it('forwards to the SDK', () => {
    const err = new Error('boom');
    captureException(err);

    expect(Sentry.captureException).toHaveBeenCalledWith(err);
  });
});
