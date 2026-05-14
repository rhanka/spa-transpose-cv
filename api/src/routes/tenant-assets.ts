import { Hono } from 'hono';
import { logger } from '../config/logger.js';
import { authorizeTenantAssetRequest } from '../services/tenant-assets-auth.js';
import {
  getTenantConfigByTenantKey,
  readStorageObjectBuffer,
  TenantConfigError,
} from '../services/tenant-config.js';
import {
  tenantConfigToBrandTokens,
  tenantConfigToTemplateManifest,
} from '../services/tenant-template-assets.js';

export const tenantAssetRoutes = new Hono();

function addPrivateCacheHeaders(response: Response): Response {
  response.headers.set('Cache-Control', 'private, max-age=300');
  return response;
}

function handleTenantAssetError(error: unknown): Response {
  if (error instanceof TenantConfigError) {
    if (error.statusCode === 404) {
      return new Response(null, { status: 404 });
    }

    if (error.statusCode === 401 && error.code === 'invalid_jwt') {
      return Response.json({
        error: 'invalid_jwt',
        reason: error.message,
      }, { status: 401 });
    }

    return Response.json({
      error: error.message,
      code: error.code,
    }, { status: error.statusCode });
  }

  logger.error({ err: error }, 'Tenant assets route failure');
  return Response.json({
    error: 'Tenant assets route failure',
    code: 'tenant_assets_route_failure',
  }, { status: 500 });
}

tenantAssetRoutes.get('/:tenantKey/manifest', async (c) => {
  const tenantKey = c.req.param('tenantKey');
  try {
    await authorizeTenantAssetRequest(c.req.header('Authorization'), tenantKey);
    const config = await getTenantConfigByTenantKey(tenantKey);
    return addPrivateCacheHeaders(Response.json(tenantConfigToTemplateManifest(config)));
  } catch (error) {
    return handleTenantAssetError(error);
  }
});

tenantAssetRoutes.get('/:tenantKey/base.docx', async (c) => {
  const tenantKey = c.req.param('tenantKey');
  try {
    await authorizeTenantAssetRequest(c.req.header('Authorization'), tenantKey);
    const config = await getTenantConfigByTenantKey(tenantKey);
    const templateBytes = await readStorageObjectBuffer(config.templateKey);

    return addPrivateCacheHeaders(new Response(new Uint8Array(templateBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    }));
  } catch (error) {
    return handleTenantAssetError(error);
  }
});

tenantAssetRoutes.get('/:tenantKey/brand', async (c) => {
  const tenantKey = c.req.param('tenantKey');
  try {
    await authorizeTenantAssetRequest(c.req.header('Authorization'), tenantKey);
    const config = await getTenantConfigByTenantKey(tenantKey);
    return addPrivateCacheHeaders(Response.json(tenantConfigToBrandTokens(config)));
  } catch (error) {
    return handleTenantAssetError(error);
  }
});
