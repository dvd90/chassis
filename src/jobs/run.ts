import { jobs, runJob, schedule, JobContext } from './index';
import { initIntegrations, shutdownIntegrations } from '../integrations';
import { logger } from '../utils/logger';

/**
 * The second entrypoint. Same build, same image, same integrations as
 * src/server.ts — a different process:
 *
 *   npm run jobs              schedule everything and stay up
 *   npm run jobs -- <name>    run one job once and exit (local dev, backfills)
 *   node dist/jobs/run.js     the production form of the first
 */
async function main(): Promise<void> {
  await initIntegrations();

  const controller = new AbortController();
  const ctx: JobContext = { logger, signal: controller.signal };
  const requested = process.argv[2];

  if (requested) {
    const job = jobs.find((candidate) => candidate.name === requested);

    if (!job) {
      logger.error(`Unknown job: ${requested}`, {
        available: jobs.map((candidate) => candidate.name)
      });
      await shutdownIntegrations();
      process.exit(1);
    }

    await runJob(job, ctx);
    await shutdownIntegrations();
    return;
  }

  if (!jobs.length) {
    logger.warn('No jobs registered — add one to src/jobs/index.ts');
    await shutdownIntegrations();
    return;
  }

  const running = schedule(ctx);
  logger.info(`⏱️  Jobs running: ${jobs.map((job) => job.name).join(', ')}`);

  const shutdown = (signal: string): void => {
    logger.info(`${signal} received — stopping jobs`);

    running.stop();
    controller.abort();

    shutdownIntegrations()
      .catch((err: Error) =>
        logger.error(`Error during shutdown: ${err.message}`)
      )
      .finally(() => process.exit(0));

    // Failsafe: force-exit if a long-running job ignores its abort signal.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: Error) => {
  logger.error(`Failed to start jobs: ${err.message}`, { stack: err.stack });
  process.exit(1);
});
