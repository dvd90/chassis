import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../utils/logger';
import { runJob, schedule, JobContext, JobDefinition } from './index';

const context = (signal: AbortSignal): JobContext => ({ logger, signal });
const never = new AbortController().signal;

afterEach(() => vi.restoreAllMocks());

describe('runJob', () => {
  it('runs the job once', async () => {
    const run = vi.fn().mockResolvedValue(undefined);

    await runJob({ name: 'once', run }, context(never));

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('logs a failure instead of rethrowing it', async () => {
    const error = vi.spyOn(logger, 'error').mockReturnValue(logger);

    await expect(
      runJob(
        { name: 'boom', run: () => Promise.reject(new Error('nope')) },
        context(never)
      )
    ).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith('job boom failed', { error: 'nope' });
  });
});

describe('schedule', () => {
  it('starts an unscheduled job immediately and aborts it on shutdown', async () => {
    const controller = new AbortController();
    let aborted = false;

    const consumer: JobDefinition = {
      name: 'consumer',
      run: ({ signal }) =>
        new Promise((resolve) =>
          signal.addEventListener('abort', () => {
            aborted = true;
            resolve();
          })
        )
    };

    const running = schedule(context(controller.signal), [consumer]);

    // The long-running job is already in flight and still waiting.
    await Promise.resolve();
    expect(aborted).toBe(false);

    running.stop();
    controller.abort();

    await vi.waitFor(() => expect(aborted).toBe(true));
  });

  it('does not fire a cron job at boot', async () => {
    const run = vi.fn().mockResolvedValue(undefined);

    const running = schedule(context(never), [
      { name: 'nightly', schedule: '0 3 * * *', run }
    ]);

    await Promise.resolve();
    running.stop();

    expect(run).not.toHaveBeenCalled();
  });
});
