import { serve } from '@hono/node-server';
import { app } from './app.js';
import { logger } from './config/logger.js';
import { env } from './config/env.js';
import { startPurgeSweep } from './services/purge.js';
import { validateProviderConfig } from './services/llm/index.js';

const port = env.API_PORT;

// Validate LLM provider config at startup
validateProviderConfig();

// Start session purge sweep
startPurgeSweep();

serve({ fetch: app.fetch, port }, (info) => {
  logger.info(`API listening on http://0.0.0.0:${info.port}`);
});
