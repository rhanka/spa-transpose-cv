import { serve } from '@hono/node-server';
import { app } from './app.js';
import { logger } from './config/logger.js';
import { env } from './config/env.js';
import { startPurgeSweep } from './services/purge.js';

const port = env.API_PORT;

// Start session purge sweep
startPurgeSweep();

serve({ fetch: app.fetch, port }, (info) => {
  logger.info(`API listening on http://0.0.0.0:${info.port}`);
});
