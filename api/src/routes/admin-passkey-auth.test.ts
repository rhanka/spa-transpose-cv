import assert from 'node:assert/strict';
import test from 'node:test';

process.env.TENANT_STORAGE_BACKEND = 'local';
process.env.ADMIN_SEED_SECRET = 'admin-passkey-test-secret';
process.env.ADMIN_AUTH_EMAILS = 'ops@sent-tech.ca';
process.env.WEBAUTHN_RP_ID = 'cv-api.sent-tech.ca';
process.env.WEBAUTHN_RP_NAME = 'CV Transpose Backoffice';
process.env.WEBAUTHN_ORIGIN = 'https://cv.sent-tech.ca';

const { app } = await import('../app.js');

test('starts admin passkey enrollment with email OTP', async () => {
  const response = await app.request('https://cv-api.sent-tech.ca/api/admin/auth/email/otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'OPS@sent-tech.ca' }),
  });

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.email, 'ops@sent-tech.ca');
  assert.equal(['smtp', 'log'].includes(body.delivery), true);
  assert.equal(typeof body.challengeId, 'string');
  assert.equal(body.challengeId.length > 16, true);
  assert.match(body.expiresAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(body.devOtp, /^\d{6}$/);
});

test('verifies admin email OTP and returns a registration token', async () => {
  const startResponse = await app.request('https://cv-api.sent-tech.ca/api/admin/auth/email/otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ops@sent-tech.ca' }),
  });
  const startBody = await startResponse.json();

  const verifyResponse = await app.request('https://cv-api.sent-tech.ca/api/admin/auth/email/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challengeId: startBody.challengeId,
      otp: startBody.devOtp,
    }),
  });

  assert.equal(verifyResponse.status, 200);
  const verifyBody = await verifyResponse.json();
  assert.equal(verifyBody.email, 'ops@sent-tech.ca');
  assert.equal(verifyBody.verified, true);
  assert.equal(typeof verifyBody.verificationToken, 'string');
  assert.equal(verifyBody.verificationToken.length > 32, true);
});

test('generates admin passkey registration options after OTP verification', async () => {
  const startResponse = await app.request('https://cv-api.sent-tech.ca/api/admin/auth/email/otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ops@sent-tech.ca' }),
  });
  const startBody = await startResponse.json();
  const verifyResponse = await app.request('https://cv-api.sent-tech.ca/api/admin/auth/email/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challengeId: startBody.challengeId,
      otp: startBody.devOtp,
    }),
  });
  const verifyBody = await verifyResponse.json();

  const response = await app.request('https://cv-api.sent-tech.ca/api/admin/auth/passkey/register/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'ops@sent-tech.ca',
      verificationToken: verifyBody.verificationToken,
    }),
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.email, 'ops@sent-tech.ca');
  assert.equal(body.options.rp.id, 'cv-api.sent-tech.ca');
  assert.equal(body.options.rp.name, 'CV Transpose Backoffice');
  assert.equal(body.options.user.name, 'ops@sent-tech.ca');
  assert.equal(body.options.authenticatorSelection.userVerification, 'required');
  assert.equal(typeof body.options.challenge, 'string');
});

test('generates discoverable admin passkey login options', async () => {
  const response = await app.request('https://cv-api.sent-tech.ca/api/admin/auth/passkey/login/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.options.rpId, 'cv-api.sent-tech.ca');
  assert.equal(body.options.userVerification, 'required');
  assert.equal(typeof body.options.challenge, 'string');
});

test('rejects admin OTP for non-allowlisted email', async () => {
  const response = await app.request('https://cv-api.sent-tech.ca/api/admin/auth/email/otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'intruder@example.com' }),
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: 'Admin email is not allowed',
    code: 'admin_email_not_allowed',
  });
});
