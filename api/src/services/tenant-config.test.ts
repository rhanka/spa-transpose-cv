import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_TENANT_SLUG,
  TenantConfigError,
  normalizeTenantSlug,
  resolveTenantSlug,
} from './tenant-config.js';

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
