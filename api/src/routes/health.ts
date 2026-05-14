import { Hono } from 'hono';
import { buildInfo } from '../config/env.js';

export const healthRoutes = new Hono();

healthRoutes.get('/', (c) => {
  return c.json({ status: 'ok', ...buildInfo, timestamp: new Date().toISOString() });
});
