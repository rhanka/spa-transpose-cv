import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { app as cvApp } from '../app.js';

// Regression guard for GHSA-jpvv-r467-5p4w (@hono/node-server < 1.19.18 / < 2.1.6).
//
// In the vulnerable versions a backslash in the request path was treated as a
// path separator: a target such as `/public/..\admin/secret` was normalised to
// `/admin/secret`, so a caller reached a handler the literal target never named.
// Any path-based access control (a static/public prefix, an admin route, a proxy
// rule) could thereby be bypassed. Fixed in 1.19.18.
//
// The defect lives in the @hono/node-server boundary that turns a raw Node
// request into a Fetch Request — exactly what `serve()` does in src/index.ts.
// Hono's in-process `app.request()` helper never exercises that boundary, so
// this test boots the REAL server and writes raw request-targets over a socket
// (a normal fetch client would percent-encode the backslash away).

function buildApp(): Hono {
  const app = new Hono();
  // Only a caller that explicitly targets this path may reach it.
  app.get('/admin/secret', (c) => c.json({ reached: 'admin' }));
  // An open prefix that an attacker is allowed to hit.
  app.get('/public/ping', (c) => c.text('pong'));
  app.notFound((c) => c.json({ error: 'not_found' }, 404));
  return app;
}

function startServer(app: Hono): Promise<{ server: ReturnType<typeof serve>; port: number }> {
  return new Promise((resolve) => {
    const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, (info) => {
      resolve({ server, port: info.port });
    });
  });
}

// Send a raw HTTP/1.1 request with an arbitrary, unencoded request-target.
function rawRequest(port: number, method: string, target: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    let data = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      data += chunk;
    });
    socket.on('error', reject);
    socket.on('end', () => resolve(data));
    socket.write(`${method} ${target} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`);
  });
}

function statusLine(raw: string): string {
  return raw.split('\r\n', 1)[0] ?? '';
}

test('backslash path traversal never reaches a protected handler (GHSA-jpvv-r467-5p4w)', async () => {
  const { server, port } = await startServer(buildApp());
  try {
    // Baseline: the literal protected target is reachable (sanity on the fixture).
    const direct = await rawRequest(port, 'GET', '/admin/secret');
    assert.match(statusLine(direct), /\b200\b/, 'fixture: literal /admin/secret must be reachable');
    assert.match(direct, /"reached":"admin"/, 'fixture: literal /admin/secret must hit the handler');

    // Baseline: the open prefix is reachable.
    const open = await rawRequest(port, 'GET', '/public/ping');
    assert.match(statusLine(open), /\b200\b/, 'fixture: /public/ping must be reachable');

    // None of these backslash traversals (raw or encoded) may resolve to /admin/secret.
    const bypassTargets = [
      '/public/..\\admin/secret', // literal backslash
      '/public/..%5cadmin/secret', // percent-encoded backslash (lower)
      '/public/..%5Cadmin/secret', // percent-encoded backslash (upper)
      '/public%5c..%5cadmin/secret', // backslash as the /public separator too
      '/public/..%255cadmin/secret', // double-encoded backslash
    ];

    for (const target of bypassTargets) {
      const raw = await rawRequest(port, 'GET', target);
      assert.doesNotMatch(raw, /"reached":"admin"/, `path bypass leaked the protected handler for target ${target}`);
      assert.doesNotMatch(statusLine(raw), /\b200\b/, `path bypass returned 200 for target ${target}`);
    }
  } finally {
    server.close();
  }
});

// The same guard against the cv API's real protected surface: the `/api/admin`
// routes (bearer-gated inside their handlers) must stay unreachable when a
// backslash traversal is pushed through the real node-server boundary.
test('cv /api/admin routes stay gated under backslash traversal (GHSA-jpvv-r467-5p4w)', async () => {
  const { server, port } = await startServer(cvApp);
  try {
    const adminTraversals = [
      '/public/..\\api/admin/session',
      '/api/admin\\session',
      '/public/..%5capi%5cadmin%5csession',
      '/api\\admin\\claims\\verify-otp',
    ];
    for (const target of adminTraversals) {
      const line = statusLine(await rawRequest(port, 'POST', target));
      assert.match(
        line,
        /\b(400|401|404)\b/,
        `"${target}" -> "${line}"; an un-authenticated admin request must be rejected (400/401/404), never reach a 2xx handler`,
      );
    }
    // Positive control: a legitimate open route still resolves through node-server.
    assert.match(statusLine(await rawRequest(port, 'GET', '/api')), /\b200\b/, 'fixture: GET /api must return 200');
  } finally {
    server.close();
  }
});
