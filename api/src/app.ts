import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { sessionRoutes } from './routes/sessions.js';
import { healthRoutes } from './routes/health.js';
import { modelRoutes } from './routes/models.js';

export const app = new Hono();

// Security headers
app.use(secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
  },
  xFrameOptions: 'DENY',
  xContentTypeOptions: 'nosniff',
  referrerPolicy: 'strict-origin-when-cross-origin',
}));

// CORS
app.use(cors({
  origin: env.CORS_ALLOWED_ORIGINS.split(','),
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-Session-Password'],
  credentials: true,
}));

// Request logging
app.use(async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  logger.info({ method: c.req.method, path: c.req.path, status: c.res.status, ms });
});

// Routes
app.route('/api/health', healthRoutes);
app.route('/api/models', modelRoutes);
app.route('/api/sessions', sessionRoutes);

// Root
app.get('/', (c) => c.json({ name: 'spa-transpose-cv-api', version: '0.1.0' }));
