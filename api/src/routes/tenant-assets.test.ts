import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { after, before, test } from 'node:test';
process.env.TENANT_STORAGE_BACKEND = 'local';

const { app } = await import('../app.js');
const { clearJwksCache } = await import('../services/jwks-cache.js');

const ISSUER = 'web-direct.cv-transpose.com';
const KID = 'test-key-1';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = {
  ...(publicKey.export({ format: 'jwk' }) as JsonWebKey),
  alg: 'RS256',
  kid: KID,
  use: 'sig',
};
const originalFetch = globalThis.fetch;

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function signJwt(payload: Record<string, unknown>): string {
  const header = encodeBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: KID }));
  const body = encodeBase64Url(JSON.stringify(payload));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${body}`);
  signer.end();
  const signature = signer.sign(privateKey).toString('base64url');
  return `${header}.${body}.${signature}`;
}

function makeBearerToken(tenantKey: string): string {
  const iat = Math.floor(Date.now() / 1000);
  return signJwt({
    iss: ISSUER,
    sub: 'user@example.com',
    tk: tenantKey,
    iat,
    exp: iat + 300,
  });
}

before(() => {
  globalThis.fetch = async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url === `https://${ISSUER}/.well-known/jwks.json`) {
      return new Response(JSON.stringify({ keys: [publicJwk] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    throw new Error(`Unexpected JWKS fetch: ${url}`);
  };
});

after(() => {
  clearJwksCache();
  globalThis.fetch = originalFetch;
});

test('serves the tenant manifest over the assets API with JWT auth', async () => {
  clearJwksCache();
  const tenantKey = 'direct:scalian';
  const response = await app.request(`https://cv-api.sent-tech.ca/api/v1/tenants/${encodeURIComponent(tenantKey)}/manifest`, {
    headers: {
      Authorization: `Bearer ${makeBearerToken(tenantKey)}`,
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, max-age=300');
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);

  const manifest = await response.json();
  assert.equal(manifest.version, '1.0');
  assert.equal(manifest.tenantKey, 'direct:scalian');
});

test('serves the tenant base.docx over the assets API with JWT auth', async () => {
  clearJwksCache();
  const tenantKey = 'direct:scalian';
  const response = await app.request(`https://cv-api.sent-tech.ca/api/v1/tenants/${encodeURIComponent(tenantKey)}/base.docx`, {
    headers: {
      Authorization: `Bearer ${makeBearerToken(tenantKey)}`,
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, max-age=300');
  assert.equal(
    response.headers.get('content-type'),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );

  const buffer = Buffer.from(await response.arrayBuffer());
  assert.equal(buffer.subarray(0, 4).toString('hex'), '504b0304');
});

test('serves the tenant brand tokens over the assets API with JWT auth', async () => {
  clearJwksCache();
  const tenantKey = 'direct:scalian';
  const response = await app.request(`https://cv-api.sent-tech.ca/api/v1/tenants/${encodeURIComponent(tenantKey)}/brand`, {
    headers: {
      Authorization: `Bearer ${makeBearerToken(tenantKey)}`,
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, max-age=300');
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);

  const brand = await response.json();
  assert.equal(brand.primary, '#7030A0');
  assert.equal(brand.fontFamily, 'Cambria');
});

test('rejects a JWT whose tenant key does not match the request path', async () => {
  clearJwksCache();
  const response = await app.request('https://cv-api.sent-tech.ca/api/v1/tenants/direct%3Ascalian/manifest', {
    headers: {
      Authorization: `Bearer ${makeBearerToken('direct:_default')}`,
    },
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: 'invalid_jwt',
    reason: 'tk_mismatch',
  });
});

test('returns 404 without a body when the tenant is unknown', async () => {
  clearJwksCache();
  const tenantKey = 'direct:missing-tenant';
  const response = await app.request(`https://cv-api.sent-tech.ca/api/v1/tenants/${encodeURIComponent(tenantKey)}/manifest`, {
    headers: {
      Authorization: `Bearer ${makeBearerToken(tenantKey)}`,
    },
  });

  assert.equal(response.status, 404);
  assert.equal(await response.text(), '');
});
