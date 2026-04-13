import { Hono } from 'hono';
import { logger } from '../config/logger.js';
import { getTenantConfig, TenantConfigError } from '../services/tenant-config.js';

export const tenantRoutes = new Hono();

function handleTenantError(error: unknown, context: string) {
  if (error instanceof TenantConfigError) {
    return {
      body: {
        error: error.message,
        code: error.code,
      },
      status: error.statusCode as 400 | 404 | 500,
    };
  }

  logger.error({ err: error }, context);
  return {
    body: {
      error: 'Failed to load tenant config',
      code: 'tenant_config_load_failed',
    },
    status: 500 as const,
  };
}

tenantRoutes.get('/config', async (c) => {
  try {
    const config = await getTenantConfig({
      headerTenant: c.req.header('X-Tenant'),
    });
    return c.json(config);
  } catch (error) {
    const response = handleTenantError(error, 'Failed to load tenant config from header/default');
    return c.json(response.body, response.status);
  }
});

tenantRoutes.get('/:slug/config', async (c) => {
  try {
    const config = await getTenantConfig({
      explicitSlug: c.req.param('slug'),
      headerTenant: c.req.header('X-Tenant'),
    });
    return c.json(config);
  } catch (error) {
    const response = handleTenantError(error, 'Failed to load tenant config from route slug');
    return c.json(response.body, response.status);
  }
});
