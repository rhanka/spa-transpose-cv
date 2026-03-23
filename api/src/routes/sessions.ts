import { Hono } from 'hono';

export const sessionRoutes = new Hono();

// Placeholder — will be implemented in Phase 2
sessionRoutes.post('/', (c) => {
  return c.json({ message: 'TODO: create session' }, 501);
});
