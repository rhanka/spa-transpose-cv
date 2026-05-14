import assert from 'node:assert/strict';
import test from 'node:test';
import { app } from './app.js';

test('health and root endpoints expose build metadata', async () => {
  const health = await app.request('https://cv-api.sent-tech.ca/api/health');
  const root = await app.request('https://cv-api.sent-tech.ca/');

  assert.equal(health.status, 200);
  assert.equal(root.status, 200);

  const healthJson = await health.json() as Record<string, unknown>;
  const rootJson = await root.json() as Record<string, unknown>;

  assert.equal(healthJson.status, 'ok');
  assert.equal(healthJson.version, 'dev');
  assert.equal(healthJson.commit, 'unknown');
  assert.equal(healthJson.ref, 'local');
  assert.equal(rootJson.version, healthJson.version);
  assert.equal(rootJson.commit, healthJson.commit);
  assert.equal(rootJson.ref, healthJson.ref);
});

test('redirects the legacy Scalian UI host to the canonical tenant route', async () => {
  const response = await app.request('https://scalian-cv.sent-tech.ca/uploads?batch=1');

  assert.equal(response.status, 301);
  assert.equal(
    response.headers.get('location'),
    'https://cv.sent-tech.ca/scalian/uploads?batch=1',
  );
});

test('redirects the legacy Scalian UI root without duplicating the tenant slug', async () => {
  const response = await app.request('https://scalian-cv.sent-tech.ca/scalian/?from=legacy');

  assert.equal(response.status, 301);
  assert.equal(
    response.headers.get('location'),
    'https://cv.sent-tech.ca/scalian/?from=legacy',
  );
});
