import { Hono } from 'hono';
import { listAvailableProviders } from '../services/llm/index.js';
import { env } from '../config/env.js';

export const modelRoutes = new Hono();

// GET /api/models — list available providers + active selection
modelRoutes.get('/', (c) => {
  const providers = listAvailableProviders();
  return c.json({
    active: env.LLM_PROVIDER,
    providers,
  });
});
