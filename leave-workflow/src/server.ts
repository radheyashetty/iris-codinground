/**
 * server.ts — Entry point. Creates the app and starts listening.
 * Separated from app.ts so tests can import app without binding a port.
 */
import { createApp, logger } from './app';
import { config } from './config/env';
import { getDb } from './db/connection';

/** Initialise DB (runs schema migrations) then start HTTP server. */
function main(): void {
  getDb(); // ensures schema is applied before first request
  const app = createApp();
  app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, 'Leave Workflow API listening');
  });
}

main();
