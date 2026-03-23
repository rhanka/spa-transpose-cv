import { Hono } from 'hono';

export const healthRoutes = new Hono();

healthRoutes.get('/', (c) => {
  return c.json({ status: 'ok', version: '0.1.0', timestamp: new Date().toISOString() });
});
