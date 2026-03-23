import { logger } from '../config/logger.js';

export function startPurgeSweep() {
  // Placeholder — will be implemented in Phase 2
  const intervalMs = 60 * 60 * 1000; // 1 hour
  setInterval(() => {
    logger.info('Purge sweep: checking for expired sessions...');
    // TODO: scan DATA_DIR, remove sessions older than SESSION_MAX_AGE_HOURS
  }, intervalMs);
  logger.info('Purge sweep scheduled (every 1h)');
}
