import assert from 'node:assert/strict';
import test from 'node:test';
import { app } from './app.js';

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


test('serves an API index at /api', async () => {
  const response = await app.request('https://cv-api.sent-tech.ca/api');

  assert.equal(response.status, 200);
  const body = await response.json() as { name: string; routes: string[] };
  assert.equal(body.name, 'spa-transpose-cv-api');
  assert.ok(body.routes.includes('/api/health'));
});
