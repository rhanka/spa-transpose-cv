import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { z } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import {
  createSession,
  getMeta,
  writeMeta,
  authenticateSession,
  addFile,
  getDecryptedFile,
  listOutputs,
  getSessionKey,
  updateStatus,
} from '../services/session-manager.js';

export const sessionRoutes = new Hono();

// POST /api/sessions — create session
sessionRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = z.object({ password: z.string().min(1) }).safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Password is required' }, 400);
  }
  const meta = await createSession(parsed.data.password);
  return c.json({ sessionId: meta.id, expiresAt: meta.expiresAt }, 201);
});

// POST /api/sessions/:id/upload — upload files (multipart)
sessionRoutes.post('/:id/upload', async (c) => {
  const { id } = c.req.param();
  const password = c.req.header('X-Session-Password');
  if (!password) return c.json({ error: 'X-Session-Password header required' }, 401);

  const meta = await getMeta(id);
  if (!meta) return c.json({ error: 'Session not found' }, 404);

  const key = authenticateSession(id, password, meta.salt);

  const formData = await c.req.formData();
  const files = formData.getAll('files');

  if (!files.length) return c.json({ error: 'No files provided' }, 400);

  const entries = [];
  for (const file of files) {
    if (!(file instanceof File)) continue;
    const buffer = Buffer.from(await file.arrayBuffer());
    const entry = await addFile(id, file.name, buffer, key);
    entries.push(entry);
  }

  return c.json({ uploaded: entries.length, files: entries.map(e => e.originalName) });
});

// POST /api/sessions/:id/ready — mark session as ready with prompt
sessionRoutes.post('/:id/ready', async (c) => {
  const { id } = c.req.param();
  const password = c.req.header('X-Session-Password');
  if (!password) return c.json({ error: 'X-Session-Password header required' }, 401);

  const meta = await getMeta(id);
  if (!meta) return c.json({ error: 'Session not found' }, 404);

  authenticateSession(id, password, meta.salt);

  const body = await c.req.json().catch(() => ({}));
  const parsed = z.object({ prompt: z.string().default('') }).safeParse(body);

  meta.prompt = parsed.success ? parsed.data.prompt : '';
  meta.status = 'ready';
  await writeMeta(meta);

  return c.json({ status: 'ready', fileCount: meta.files.length });
});

// POST /api/sessions/:id/run — start processing
sessionRoutes.post('/:id/run', async (c) => {
  const { id } = c.req.param();
  const password = c.req.header('X-Session-Password');
  if (!password) return c.json({ error: 'X-Session-Password header required' }, 401);

  const meta = await getMeta(id);
  if (!meta) return c.json({ error: 'Session not found' }, 404);
  if (meta.status !== 'ready') return c.json({ error: `Session status is ${meta.status}, expected ready` }, 400);

  authenticateSession(id, password, meta.salt);

  // Import orchestrator dynamically to avoid circular deps
  const { runOrchestrator } = await import('../services/orchestrator.js');
  // Fire and forget — progress tracked via SSE
  runOrchestrator(id).catch(err => {
    logger.error(err, 'Orchestrator error');
    updateStatus(id, 'error').catch(() => {});
  });

  await updateStatus(id, 'processing');
  return c.json({ status: 'processing' });
});

// GET /api/sessions/:id/status — SSE progress stream
sessionRoutes.get('/:id/status', async (c) => {
  const { id } = c.req.param();
  const meta = await getMeta(id);
  if (!meta) return c.json({ error: 'Session not found' }, 404);

  return stream(c, async (s) => {
    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');

    let lastStatus = '';
    let lastFileStatuses = '';

    for (let i = 0; i < 600; i++) { // 10 min max
      const current = await getMeta(id);
      if (!current) break;

      const fileStatuses = JSON.stringify(current.files.map(f => ({ name: f.originalName, status: f.status, error: f.error, output: f.outputName })));
      const statusKey = `${current.status}:${fileStatuses}`;

      if (statusKey !== lastStatus) {
        await s.write(`data: ${JSON.stringify({
          status: current.status,
          files: current.files.map(f => ({
            name: f.originalName,
            status: f.status,
            error: f.error,
            output: f.outputName,
          })),
          expiresAt: current.expiresAt,
        })}\n\n`);
        lastStatus = statusKey;
      }

      if (current.status === 'done' || current.status === 'error') break;
      await new Promise(r => setTimeout(r, 1000));
    }
  });
});

// GET /api/sessions/:id/results — list results
sessionRoutes.get('/:id/results', async (c) => {
  const { id } = c.req.param();
  const meta = await getMeta(id);
  if (!meta) return c.json({ error: 'Session not found' }, 404);

  const outputs = await listOutputs(id);
  return c.json({
    status: meta.status,
    expiresAt: meta.expiresAt,
    files: meta.files.map(f => ({
      name: f.originalName,
      status: f.status,
      output: f.outputName,
      error: f.error,
    })),
    outputs: outputs.map(f => f.replace('.enc', '')),
  });
});

// GET /api/sessions/:id/download/:file — download decrypted file
sessionRoutes.get('/:id/download/:file', async (c) => {
  const { id, file } = c.req.param();
  const password = c.req.header('X-Session-Password');
  if (!password) return c.json({ error: 'X-Session-Password header required' }, 401);

  const meta = await getMeta(id);
  if (!meta) return c.json({ error: 'Session not found' }, 404);

  try {
    const key = authenticateSession(id, password, meta.salt);
    const data = await getDecryptedFile(id, file, key, 'outputs');

    const ext = file.split('.').pop()?.toLowerCase();
    const contentType = ext === 'docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : ext === 'md' ? 'text/markdown' : 'application/octet-stream';

    c.header('Content-Type', contentType);
    c.header('Content-Disposition', `attachment; filename="${file}"`);
    return c.body(new Uint8Array(data));
  } catch (err) {
    logger.error(err, 'Download error');
    return c.json({ error: 'Decryption failed — wrong password?' }, 403);
  }
});
