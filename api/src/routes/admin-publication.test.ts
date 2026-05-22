import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import test from 'node:test';

process.env.TENANT_STORAGE_BACKEND = 'local';
process.env.ADMIN_PASSWORD_SALT = 'admin-publication-test-salt';
process.env.ADMIN_SEED_SECRET = 'admin-publication-test-secret';
process.env.ADMIN_PASSWORD_HASH = pbkdf2Sync(
  'admin-pass',
  process.env.ADMIN_PASSWORD_SALT,
  210_000,
  32,
  'sha256',
).toString('hex');

const { app } = await import('../app.js');
const { createRootAdminSession } = await import('../services/admin-auth.js');

function rootAdminHeaders(): HeadersInit {
  const { token } = createRootAdminSession('admin-pass');
  return { Authorization: `Bearer ${token}` };
}

test('serves marketplace publication status for a tenant to root admin', async () => {
  const response = await app.request(
    'https://cv-api.sent-tech.ca/api/admin/tenants/scalian/publication',
    { headers: rootAdminHeaders() },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.slug, 'scalian');
  assert.equal(body.displayName, 'Scalian');
  assert.equal(body.status, 'published');
  assert.equal(body.active, true);
  assert.equal(body.tenantKey, 'direct:scalian');
  assert.deepEqual(body.assets, {
    manifestUrl: 'https://cv-api.sent-tech.ca/api/v1/tenants/direct%3Ascalian/manifest',
    baseDocxUrl: 'https://cv-api.sent-tech.ca/api/v1/tenants/direct%3Ascalian/base.docx',
    brandUrl: 'https://cv-api.sent-tech.ca/api/v1/tenants/direct%3Ascalian/brand',
    authTenantClaim: 'tk',
  });
});

test('lists marketplace publication statuses for root admin', async () => {
  const response = await app.request(
    'https://cv-api.sent-tech.ca/api/admin/tenants/publications',
    { headers: rootAdminHeaders() },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.tenants.length >= 3, true);

  const slugs = body.tenants.map((tenant: { slug: string }) => tenant.slug);
  assert.deepEqual(slugs.slice(0, 3), ['_default', 'draft', 'scalian']);

  const draft = body.tenants.find((tenant: { slug: string }) => tenant.slug === 'draft');
  assert.deepEqual(draft, {
    slug: 'draft',
    displayName: 'Draft Tenant',
    status: 'draft',
    active: false,
    tenantKey: 'direct:draft',
    assets: {
      manifestUrl: 'https://cv-api.sent-tech.ca/api/v1/tenants/direct%3Adraft/manifest',
      baseDocxUrl: 'https://cv-api.sent-tech.ca/api/v1/tenants/direct%3Adraft/base.docx',
      brandUrl: 'https://cv-api.sent-tech.ca/api/v1/tenants/direct%3Adraft/brand',
      authTenantClaim: 'tk',
    },
  });
});

test('serves draft marketplace publication status for inactive tenant to root admin', async () => {
  const response = await app.request(
    'https://cv-api.sent-tech.ca/api/admin/tenants/draft/publication',
    { headers: rootAdminHeaders() },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.slug, 'draft');
  assert.equal(body.displayName, 'Draft Tenant');
  assert.equal(body.status, 'draft');
  assert.equal(body.active, false);
  assert.equal(body.tenantKey, 'direct:draft');
  assert.deepEqual(body.assets, {
    manifestUrl: 'https://cv-api.sent-tech.ca/api/v1/tenants/direct%3Adraft/manifest',
    baseDocxUrl: 'https://cv-api.sent-tech.ca/api/v1/tenants/direct%3Adraft/base.docx',
    brandUrl: 'https://cv-api.sent-tech.ca/api/v1/tenants/direct%3Adraft/brand',
    authTenantClaim: 'tk',
  });
});

test('returns 404 when root admin requests publication status for an unknown tenant', async () => {
  const response = await app.request(
    'https://cv-api.sent-tech.ca/api/admin/tenants/missing/publication',
    { headers: rootAdminHeaders() },
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: 'Tenant "missing" not found',
    code: 'tenant_not_found',
  });
});

test('rejects marketplace publication status without root admin token', async () => {
  const response = await app.request(
    'https://cv-api.sent-tech.ca/api/admin/tenants/scalian/publication',
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: 'Missing admin bearer token',
    code: 'missing_admin_token',
  });
});

test('rejects marketplace publication list without root admin token', async () => {
  const response = await app.request(
    'https://cv-api.sent-tech.ca/api/admin/tenants/publications',
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: 'Missing admin bearer token',
    code: 'missing_admin_token',
  });
});
