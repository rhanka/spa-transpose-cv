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
