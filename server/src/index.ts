import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { closeDb, getDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { deleteExpiredTokens } from './modules/auth/auth.repository.js';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

function bootstrap(): void {
  // Migrating on boot keeps a container deploy to a single step.
  const applied = runMigrations(getDb());
  if (applied.length > 0) {
    logger.info({ migrations: applied }, `Applied ${applied.length} pending migration(s)`);
  }

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV, database: env.databasePath },
      `PortalConnect API listening on http://localhost:${env.PORT}`,
    );
  });

  // Expired refresh tokens are dead weight; sweep them periodically.
  const cleanup = setInterval(() => {
    const removed = deleteExpiredTokens();
    if (removed > 0) logger.debug({ removed }, 'Purged expired refresh tokens');
  }, CLEANUP_INTERVAL_MS);
  cleanup.unref();

  /** Finish in-flight requests before exiting so deploys don't drop responses. */
  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info({ signal }, 'Shutting down');
    clearInterval(cleanup);

    server.close((error) => {
      if (error) {
        logger.error({ err: error }, 'Error while closing HTTP server');
        process.exit(1);
      }
      closeDb();
      process.exit(0);
    });

    // Don't hang forever on a stuck connection.
    setTimeout(() => {
      logger.error('Forced shutdown after 10s grace period');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled promise rejection');
    process.exit(1);
  });
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception');
    process.exit(1);
  });
}

bootstrap();
