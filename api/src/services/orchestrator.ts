import { logger } from '../config/logger.js';
import { getMeta, writeMeta, updateStatus } from './session-manager.js';

// Placeholder — will be fully implemented in Phase 4
export async function runOrchestrator(sessionId: string): Promise<void> {
  logger.info({ sessionId }, 'Orchestrator started');

  const meta = await getMeta(sessionId);
  if (!meta) throw new Error(`Session ${sessionId} not found`);

  // TODO Phase 4: for each file, launch a Claude agent in parallel
  // - decrypt input
  // - extract text (pdftotext / pandoc)
  // - call Claude API
  // - generate DOCX
  // - encrypt output

  // For now, mark all as done immediately (stub)
  for (const file of meta.files) {
    file.status = 'done';
    file.outputName = `Scalian_Profile_${file.originalName.replace(/\.[^.]+$/, '')}_EN.docx`;
  }
  meta.status = 'done';
  await writeMeta(meta);

  logger.info({ sessionId, fileCount: meta.files.length }, 'Orchestrator completed (stub)');
}
