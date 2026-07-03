import { type Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { sessionRoutes } from './routes/sessions.js';
import { healthRoutes } from './routes/health.js';
import { modelRoutes } from './routes/models.js';
import { tenantAssetRoutes } from './routes/tenant-assets.js';
import { tenantRoutes } from './routes/tenants.js';
import { adminRoutes } from './routes/admin.js';

export const app = new Hono();

const legacyTenantHosts = new Map<string, string>([
  ['scalian-cv.sent-tech.ca', 'scalian'],
]);

function getRequestHostname(c: Context): string {
  const forwardedHost = c.req.header('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || c.req.header('host') || new URL(c.req.url).host;
  return host.split(':')[0].toLowerCase();
}

function tenantPath(pathname: string, tenant: string): string {
  if (pathname === '/') {
    return `/${tenant}/`;
  }
  if (pathname === `/${tenant}` || pathname.startsWith(`/${tenant}/`)) {
    return pathname;
  }
  return `/${tenant}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

app.use('*', async (c, next) => {
  const tenant = legacyTenantHosts.get(getRequestHostname(c));
  if (!tenant) {
    await next();
    return;
  }

  const url = new URL(c.req.url);
  return c.redirect(`https://cv.sent-tech.ca${tenantPath(url.pathname, tenant)}${url.search}`, 301);
});

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
  allowHeaders: ['Authorization', 'Content-Type', 'X-Session-Password', 'X-Tenant'],
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
app.get('/api', (c) => c.json({
  name: 'spa-transpose-cv-api',
  version: '0.1.0',
  routes: ['/api/health', '/api/models', '/api/v1/tenants', '/api/tenants', '/api/admin', '/api/sessions'],
}));
app.route('/api/health', healthRoutes);
app.route('/api/models', modelRoutes);
app.route('/api/v1/tenants', tenantAssetRoutes);
app.route('/api/tenants', tenantRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/tenants/:slug/sessions', sessionRoutes);
app.route('/api/sessions', sessionRoutes);

// Root
app.get('/', (c) => c.json({ name: 'spa-transpose-cv-api', version: '0.1.0' }));
