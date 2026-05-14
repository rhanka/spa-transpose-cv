import assert from 'node:assert/strict';
import test from 'node:test';
process.env.TENANT_STORAGE_BACKEND = 'local';

const {
  DEFAULT_TENANT_SLUG,
  clearTenantConfigCache,
  getTenantConfigByTenantKey,
  TenantConfigError,
  normalizeTenantKey,
  normalizeTenantSlug,
  resolveTenantSlug,
} = await import('./tenant-config.js');

test('normalizeTenantSlug falls back to the default tenant and lowercases valid slugs', () => {
  assert.equal(normalizeTenantSlug(), DEFAULT_TENANT_SLUG);
  assert.equal(normalizeTenantSlug('   '), DEFAULT_TENANT_SLUG);
  assert.equal(normalizeTenantSlug('Scalian'), 'scalian');
  assert.equal(normalizeTenantSlug('tenant-42'), 'tenant-42');
});

test('normalizeTenantSlug rejects reserved and malformed slugs', () => {
  assert.throws(
    () => normalizeTenantSlug('api'),
    (error: unknown) =>
      error instanceof TenantConfigError &&
      error.code === 'reserved_tenant_slug' &&
      error.statusCode === 400,
  );

  assert.throws(
    () => normalizeTenantSlug('bad/slug'),
    (error: unknown) =>
      error instanceof TenantConfigError &&
      error.code === 'invalid_tenant_slug' &&
      error.statusCode === 400,
  );
});

test('resolveTenantSlug prefers explicit route slug over header and default fallback', () => {
  assert.equal(
    resolveTenantSlug({ explicitSlug: 'cgi', headerTenant: 'scalian' }),
    'cgi',
  );
  assert.equal(
    resolveTenantSlug({ headerTenant: 'scalian' }),
    'scalian',
  );
  assert.equal(
    resolveTenantSlug({}),
    DEFAULT_TENANT_SLUG,
  );
});

test('normalizeTenantKey lowercases and validates supported prefixes', () => {
  assert.equal(normalizeTenantKey('DIRECT:Scalian'), 'direct:scalian');
  assert.equal(normalizeTenantKey('ms:abc-def-uuid'), 'ms:abc-def-uuid');
  assert.equal(normalizeTenantKey('gws:Example.COM'), 'gws:example.com');

  assert.throws(
    () => normalizeTenantKey('bad:scalian'),
    (error: unknown) =>
      error instanceof TenantConfigError &&
      error.code === 'invalid_tenant_key' &&
      error.statusCode === 400,
  );
});

test('getTenantConfigByTenantKey resolves the seeded direct tenant', async () => {
  clearTenantConfigCache();
  const config = await getTenantConfigByTenantKey('direct:scalian');

  assert.equal(config.slug, 'scalian');
  assert.equal(config.tenantKey, 'direct:scalian');
});
