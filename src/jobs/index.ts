import { Cron } from 'croner';
import { logger } from '../utils/logger';
import { beginCheckIn } from '../integrations/sentry'; // chassis:sentry

export interface JobContext {
  logger: typeof logger;
  /**
   * Aborted on SIGTERM. A long-running job must watch it and return, or the
   * shutdown failsafe will kill the process out from under it.
   */
  signal: AbortSignal;
}

export interface JobDefinition {
  name: string;
  /**
   * A cron expression, five fields or six with seconds. Omit it for a job that
   * starts once at boot and keeps running — a queue consumer is just a job
   * with no schedule.
   */
  schedule?: string;
  run(ctx: JobContext): Promise<void>;
}

/**
 * Every job the `jobs` process runs. Add yours here:
 *
 * ```ts
 * export const jobs: JobDefinition[] = [
 *   {
 *     name: 'purge-expired-tokens',
 *     schedule: '0 3 * * *',
 *     async run({ logger }) {
 *       logger.info(`purging as of ${now().toISOString()}`);
 *     }
 *   }
 * ];
 * ```
 *
 * Read the time through `now()` from src/utils/clock.ts, never `new Date()` —
 * that is what lets a test drive a job's schedule-sensitive logic.
 */
export const jobs: JobDefinition[] = [];

/**
 * Run one job to completion.
 *
 * Failure is logged and swallowed on purpose: one bad run must not take the
 * process — and therefore every other schedule — down with it. Which means the
 * process is never how you find out a job is broken; see docs/guides/jobs.md.
 */
export async function runJob(
  job: JobDefinition,
  ctx: JobContext
): Promise<void> {
  const checkIn = beginCheckIn(job.name); // chassis:sentry

  try {
    await job.run(ctx);
    checkIn.ok(); // chassis:sentry
    ctx.logger.info(`job ${job.name} finished`);
  } catch (err) {
    checkIn.error(); // chassis:sentry
    ctx.logger.error(`job ${job.name} failed`, {
      error: (err as Error).message
    });
  }
}

export interface ScheduledJobs {
  /** Cancel every cron. In-flight runs are told to stop via `ctx.signal`. */
  stop(): void;
}

/**
 * Start every job: cron ones on their schedule, the rest immediately.
 *
 * `protect` is croner's overrun guard — a run still going when the next tick
 * arrives skips that tick rather than stacking a second copy on top.
 */
export function schedule(ctx: JobContext, list = jobs): ScheduledJobs {
  const crons: Cron[] = [];
  const longRunning: Promise<void>[] = [];

  for (const job of list) {
    if (job.schedule) {
      crons.push(
        new Cron(job.schedule, { protect: true }, () => runJob(job, ctx))
      );
    } else {
      longRunning.push(runJob(job, ctx));
    }
  }

  // An unsettled promise does not hold the event loop open — only a handle
  // does. Cron jobs bring their own timers, but a process whose only jobs are
  // long-running ones would exit the moment they park on something they do not
  // own (an abort signal, a callback from a library that keeps no handle), and
  // it would exit reporting success.
  //
  // ponytail: one no-op interval as the keep-alive. The tidier answer is for
  // every job to own a real handle, which is exactly what a harness cannot
  // assume about code it did not write.
  const keepAlive = longRunning.length
    ? setInterval(() => {}, 60_000)
    : undefined;

  const release = () => {
    if (keepAlive) clearInterval(keepAlive);
  };

  void Promise.allSettled(longRunning).then(release);

  return {
    stop: () => {
      for (const cron of crons) cron.stop();
      release();
    }
  };
}
