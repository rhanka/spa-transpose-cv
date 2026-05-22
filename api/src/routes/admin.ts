import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  AdminAuthError,
  createRootAdminSession,
  forceClaimAsRootAdmin,
  getClaimStatus,
  requestClaimOtp,
  verifyClaimOtp,
  verifyRootAdminToken,
} from '../services/admin-auth.js';
import { logger } from '../config/logger.js';
import {
  createTenantFromAdminFlow,
  getTenantMarketplacePublicationByTenantKey,
  getTenantMarketplacePublication,
  listTenantMarketplacePublications,
} from '../services/tenant-admin.js';
import { TenantConfigError } from '../services/tenant-config.js';

export const adminRoutes = new Hono();

function adminRouteStatus(statusCode: number): 400 | 401 | 404 | 409 | 410 | 500 | 503 {
  return statusCode === 400
    ? 400
    : statusCode === 401
      ? 401
      : statusCode === 404
        ? 404
        : statusCode === 409
          ? 409
          : statusCode === 410
            ? 410
            : statusCode === 503
              ? 503
              : 500;
}

function handleAdminError(c: Context, error: unknown) {
  if (error instanceof AdminAuthError) {
    return c.json({
      error: error.message,
      code: error.code,
    }, adminRouteStatus(error.statusCode));
  }

  if (error instanceof TenantConfigError) {
    return c.json({
      error: error.message,
      code: error.code,
    }, adminRouteStatus(error.statusCode));
  }

  logger.error({ err: error }, 'Admin route failure');
  return c.json({
    error: 'Admin route failure',
    code: 'admin_route_failure',
  }, 500);
}

function requireRootAdminToken(c: Context) {
  const authorization = c.req.header('Authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) {
    throw new AdminAuthError(401, 'missing_admin_token', 'Missing admin bearer token');
  }
  return verifyRootAdminToken(token);
}

adminRoutes.post('/session', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = z.object({
    password: z.string().min(1),
  }).safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Password is required', code: 'invalid_admin_session_request' }, 400);
  }

  try {
    return c.json(createRootAdminSession(parsed.data.password));
  } catch (error) {
    return handleAdminError(c, error);
  }
});

adminRoutes.post('/claims/request-otp', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = z.object({
    companyUrl: z.string().min(1),
    corporateEmail: z.string().min(1),
    slug: z.string().min(1).optional(),
  }).safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'companyUrl and corporateEmail are required', code: 'invalid_claim_request' }, 400);
  }

  try {
    return c.json(await requestClaimOtp(parsed.data), 202);
  } catch (error) {
    return handleAdminError(c, error);
  }
});

adminRoutes.post('/claims/verify-otp', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = z.object({
    challengeId: z.string().min(1),
    otp: z.string().min(1),
  }).safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'challengeId and otp are required', code: 'invalid_claim_verification' }, 400);
  }

  try {
    return c.json(await verifyClaimOtp(parsed.data));
  } catch (error) {
    return handleAdminError(c, error);
  }
});

adminRoutes.post('/claims/force', async (c) => {
  try {
    requireRootAdminToken(c);
  } catch (error) {
    return handleAdminError(c, error);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = z.object({
    companyUrl: z.string().min(1),
    corporateEmail: z.string().min(1),
    slug: z.string().min(1).optional(),
  }).safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'companyUrl and corporateEmail are required', code: 'invalid_force_claim_request' }, 400);
  }

  try {
    return c.json(await forceClaimAsRootAdmin(parsed.data));
  } catch (error) {
    return handleAdminError(c, error);
  }
});

adminRoutes.get('/claims/:slug', async (c) => {
  try {
    requireRootAdminToken(c);
  } catch (error) {
    return handleAdminError(c, error);
  }

  try {
    const claim = await getClaimStatus(c.req.param('slug'));
    if (!claim) {
      return c.json({ error: 'Claim not found', code: 'claim_not_found' }, 404);
    }
    return c.json(claim);
  } catch (error) {
    return handleAdminError(c, error);
  }
});

adminRoutes.get('/tenants/publications', async (c) => {
  try {
    requireRootAdminToken(c);
  } catch (error) {
    return handleAdminError(c, error);
  }

  try {
    const assetsBaseUrl = new URL(c.req.url).origin;
    return c.json(await listTenantMarketplacePublications({ assetsBaseUrl }));
  } catch (error) {
    return handleAdminError(c, error);
  }
});

adminRoutes.get('/tenant-publications/:tenantKey', async (c) => {
  try {
    requireRootAdminToken(c);
  } catch (error) {
    return handleAdminError(c, error);
  }

  try {
    const assetsBaseUrl = new URL(c.req.url).origin;
    return c.json(await getTenantMarketplacePublicationByTenantKey({
      tenantKey: c.req.param('tenantKey'),
      assetsBaseUrl,
    }));
  } catch (error) {
    return handleAdminError(c, error);
  }
});

adminRoutes.get('/tenants/:slug/publication', async (c) => {
  try {
    requireRootAdminToken(c);
  } catch (error) {
    return handleAdminError(c, error);
  }

  try {
    const assetsBaseUrl = new URL(c.req.url).origin;
    return c.json(await getTenantMarketplacePublication({
      slug: c.req.param('slug'),
      assetsBaseUrl,
    }));
  } catch (error) {
    return handleAdminError(c, error);
  }
});

adminRoutes.post('/tenants', async (c) => {
  const formData = await c.req.formData();
  const companyUrl = String(formData.get('companyUrl') ?? '').trim();
  const corporateEmail = String(formData.get('corporateEmail') ?? '').trim();
  const challengeId = String(formData.get('challengeId') ?? '').trim();
  const otp = String(formData.get('otp') ?? '').trim();
  const rootAdminPassword = String(formData.get('rootAdminPassword') ?? '').trim();
  const slug = String(formData.get('slug') ?? '').trim();
  const templateFile = formData.get('templateFile');

  if (!companyUrl || !corporateEmail || !(templateFile instanceof File)) {
    return c.json({
      error: 'companyUrl, corporateEmail and templateFile are required',
      code: 'invalid_tenant_create_request',
    }, 400);
  }

  if (!rootAdminPassword && (!challengeId || !otp)) {
    return c.json({
      error: 'challengeId and otp are required unless rootAdminPassword is provided',
      code: 'missing_claim_verification',
    }, 400);
  }

  if (rootAdminPassword) {
    try {
      createRootAdminSession(rootAdminPassword);
    } catch (error) {
      return handleAdminError(c, error);
    }
  }

  try {
    const templateBuffer = Buffer.from(await templateFile.arrayBuffer());
    const created = await createTenantFromAdminFlow({
      companyUrl,
      corporateEmail,
      templateFileName: templateFile.name,
      templateBuffer,
      challengeId: challengeId || undefined,
      otp: otp || undefined,
      rootAdminPassword: rootAdminPassword || undefined,
      slug: slug || undefined,
    });
    return c.json(created, 201);
  } catch (error) {
    return handleAdminError(c, error);
  }
});
