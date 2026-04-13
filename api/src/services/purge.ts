import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { listAllSessions, getMeta, deleteSession } from './session-manager.js';

const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

async function sweep(): Promise<void> {
  const sessions = await listAllSessions();
  const maxAgeMs = env.SESSION_MAX_AGE_HOURS * 3600_000;
  let purged = 0;

  for (const id of sessions) {
    const meta = await getMeta(id);
    if (!meta) {
      // Orphan directory without meta — delete
      await deleteSession(id);
      purged++;
      continue;
    }
    const age = Date.now() - new Date(meta.createdAt).getTime();
    if (age > maxAgeMs) {
      await deleteSession(id);
      purged++;
    }
  }

  if (purged > 0) {
    logger.info({ purged, total: sessions.length }, 'Purge sweep completed');
  }
}

export function startPurgeSweep(): void {
  // Run once at startup
  sweep().catch(err => logger.error(err, 'Purge sweep error'));
  // Then every hour
  setInterval(() => {
    sweep().catch(err => logger.error(err, 'Purge sweep error'));
  }, SWEEP_INTERVAL_MS);
  logger.info({ intervalMinutes: SWEEP_INTERVAL_MS / 60_000, maxAgeHours: env.SESSION_MAX_AGE_HOURS }, 'Purge sweep scheduled');
}
