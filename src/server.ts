import { createApp } from './app';
import { config } from './config';
import { initIntegrations, shutdownIntegrations } from './integrations';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  await initIntegrations();

  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info(`🏎️  Chassis running on http://localhost:${config.port}`);
  });

  const shutdown = (signal: string): void => {
    logger.info(`${signal} received — shutting down gracefully`);

    server.close(() => {
      shutdownIntegrations()
        .catch((err: Error) =>
          logger.error(`Error during shutdown: ${err.message}`)
        )
        .finally(() => process.exit(0));
    });

    // Failsafe: force-exit if connections refuse to drain.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: Error) => {
  logger.error(`Failed to start: ${err.message}`, { stack: err.stack });
  process.exit(1);
});
