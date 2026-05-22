import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  type WebAuthnCredential,
} from '@simplewebauthn/server';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AdminAuthError } from './admin-auth.js';
import {
  readStorageObjectText,
  TenantConfigError,
  writeStorageObjectText,
} from './tenant-config.js';

const OTP_MAX_ATTEMPTS = 5;

interface PendingAdminOtpChallenge {
  id: string;
  email: string;
  otpHash: string;
  createdAt: string;
  expiresAt: string;
  attempts: number;
}

interface PendingAdminVerificationToken {
  token: string;
  email: string;
  createdAt: string;
  expiresAt: string;
}

interface PendingAdminWebAuthnChallenge {
  challenge: string;
  email?: string;
  type: 'registration' | 'authentication';
  createdAt: string;
  expiresAt: string;
}

interface AdminPasskeyCredential {
  id: string;
  email: string;
  credentialId: string;
  publicKeyCose: string;
  counter: number;
  deviceName: string;
  transports: AuthenticatorTransportFuture[];
  userVerified: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

interface AdminPasskeyStore {
  version: 'v1';
  credentials: AdminPasskeyCredential[];
}

interface RootAdminTokenPayload {
  role: 'root-admin';
  iat: number;
  exp: number;
  email: string;
  authMethod: 'passkey';
}

let mailTransporter: Transporter | null | undefined;
const pendingAdminOtpChallenges = new Map<string, PendingAdminOtpChallenge>();
const pendingAdminVerificationTokens = new Map<string, PendingAdminVerificationToken>();
const pendingAdminWebAuthnChallenges = new Map<string, PendingAdminWebAuthnChallenge>();

function getAdminSeedSecret(): string {
  return env.ADMIN_SEED_SECRET ?? env.ADMIN_PASSWORD_SALT ?? '';
}

function assertAdminSeedConfigured(): void {
  if (!getAdminSeedSecret()) {
    throw new AdminAuthError(503, 'admin_seed_secret_missing', 'Admin seed secret is not configured');
  }
}

function signToken(encodedPayload: string): string {
  return createHmac('sha256', getAdminSeedSecret()).update(encodedPayload).digest('base64url');
}

function parseEmailDomain(email: string): string {
  const parts = email.trim().toLowerCase().split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1] || !parts[1].includes('.')) {
    throw new AdminAuthError(400, 'invalid_admin_email', `Invalid admin email "${email}"`);
  }
  return parts[1];
}

function normalizeAdminEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  parseEmailDomain(normalized);
  return normalized;
}

function getAdminAuthAllowlist(): Set<string> {
  return new Set((env.ADMIN_AUTH_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean));
}

function assertAdminEmailAllowed(email: string): void {
  const allowlist = getAdminAuthAllowlist();
  if (allowlist.size === 0) {
    if (env.NODE_ENV === 'production') {
      throw new AdminAuthError(503, 'admin_auth_email_allowlist_missing', 'Admin auth email allowlist is not configured');
    }
    return;
  }

  if (!allowlist.has(email)) {
    throw new AdminAuthError(403, 'admin_email_not_allowed', 'Admin email is not allowed');
  }
}

function hashOtp(challengeId: string, otp: string): string {
  return createHmac('sha256', getAdminSeedSecret()).update(`${challengeId}:${otp}`).digest('hex');
}

function secureEqualHex(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function cleanupExpiredChallenges(): void {
  const now = Date.now();
  for (const [id, challenge] of pendingAdminOtpChallenges.entries()) {
    if (Date.parse(challenge.expiresAt) <= now) {
      pendingAdminOtpChallenges.delete(id);
    }
  }
  for (const [token, verification] of pendingAdminVerificationTokens.entries()) {
    if (Date.parse(verification.expiresAt) <= now) {
      pendingAdminVerificationTokens.delete(token);
    }
  }
  for (const [challenge, record] of pendingAdminWebAuthnChallenges.entries()) {
    if (Date.parse(record.expiresAt) <= now) {
      pendingAdminWebAuthnChallenges.delete(challenge);
    }
  }
}

function getMailer(): Transporter | null {
  if (mailTransporter !== undefined) {
    return mailTransporter;
  }

  if (!env.SMTP_HOST) {
    mailTransporter = null;
    return mailTransporter;
  }

  mailTransporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER && env.SMTP_PASS
      ? {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      }
      : undefined,
  });

  return mailTransporter;
}

async function sendAdminAuthOtpEmail(params: {
  email: string;
  otp: string;
  expiresAt: string;
}): Promise<'smtp' | 'log'> {
  const transporter = getMailer();
  if (!transporter) {
    logger.info({ email: params.email, otp: params.otp, expiresAt: params.expiresAt }, 'Admin auth OTP generated without SMTP transport');
    return 'log';
  }

  await transporter.sendMail({
    from: env.SMTP_FROM ?? 'cv-transpose@sent-tech.local',
    to: params.email,
    subject: 'CV Transpose admin OTP',
    text: [`OTP: ${params.otp}`, `Expires at: ${params.expiresAt}`].join('\n'),
  });

  return 'smtp';
}

async function readAdminPasskeyStore(): Promise<AdminPasskeyStore> {
  try {
    const raw = await readStorageObjectText('admin/passkeys.json');
    const parsed = JSON.parse(raw) as AdminPasskeyStore;
    return {
      version: 'v1',
      credentials: Array.isArray(parsed.credentials) ? parsed.credentials : [],
    };
  } catch (error) {
    if (error instanceof TenantConfigError && error.code === 'tenant_asset_not_found') {
      return { version: 'v1', credentials: [] };
    }
    throw error;
  }
}

async function writeAdminPasskeyStore(store: AdminPasskeyStore): Promise<void> {
  await writeStorageObjectText('admin/passkeys.json', JSON.stringify(store, null, 2));
}

function createAdminVerificationToken(email: string): PendingAdminVerificationToken {
  const token = randomBytes(32).toString('base64url');
  const verification = {
    token,
    email,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + env.ADMIN_OTP_TTL_MINUTES * 60_000).toISOString(),
  };
  pendingAdminVerificationTokens.set(token, verification);
  return verification;
}

function verifyAdminVerificationToken(token: string, email: string): void {
  cleanupExpiredChallenges();
  const verification = pendingAdminVerificationTokens.get(token);
  if (!verification || verification.email !== email) {
    throw new AdminAuthError(403, 'invalid_admin_verification_token', 'Invalid admin verification token');
  }
  if (Date.parse(verification.expiresAt) <= Date.now()) {
    pendingAdminVerificationTokens.delete(token);
    throw new AdminAuthError(410, 'admin_verification_token_expired', 'Admin verification token expired');
  }
}

function getWebAuthnRpId(): string {
  if (env.WEBAUTHN_RP_ID) {
    return env.WEBAUTHN_RP_ID;
  }
  return env.NODE_ENV === 'production' ? 'cv.sent-tech.ca' : 'localhost';
}

function getWebAuthnOrigins(): string[] {
  return env.WEBAUTHN_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function createWebAuthnChallenge(input: {
  email?: string;
  type: PendingAdminWebAuthnChallenge['type'];
  ttlMs: number;
}): PendingAdminWebAuthnChallenge {
  cleanupExpiredChallenges();
  const record = {
    challenge: randomBytes(32).toString('base64url'),
    email: input.email,
    type: input.type,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + input.ttlMs).toISOString(),
  };
  pendingAdminWebAuthnChallenges.set(record.challenge, record);
  return record;
}

function verifyWebAuthnChallenge(input: {
  challenge: string;
  email?: string;
  type: PendingAdminWebAuthnChallenge['type'];
}): void {
  cleanupExpiredChallenges();
  const record = pendingAdminWebAuthnChallenges.get(input.challenge);
  if (!record || record.type !== input.type || (input.email && record.email !== input.email)) {
    throw new AdminAuthError(400, 'invalid_webauthn_challenge', 'Invalid or expired WebAuthn challenge');
  }
  if (Date.parse(record.expiresAt) <= Date.now()) {
    pendingAdminWebAuthnChallenges.delete(input.challenge);
    throw new AdminAuthError(410, 'webauthn_challenge_expired', 'WebAuthn challenge expired');
  }
}

function parseClientChallenge(credential: RegistrationResponseJSON | AuthenticationResponseJSON): string {
  const clientDataJson = credential.response.clientDataJSON;
  if (!clientDataJson) {
    throw new AdminAuthError(400, 'invalid_webauthn_credential', 'Invalid WebAuthn credential');
  }

  try {
    const clientData = JSON.parse(Buffer.from(clientDataJson, 'base64url').toString('utf8')) as { challenge?: string };
    if (!clientData.challenge) {
      throw new Error('missing challenge');
    }
    return clientData.challenge;
  } catch {
    throw new AdminAuthError(400, 'invalid_webauthn_credential', 'Invalid WebAuthn credential');
  }
}

function createRootAdminPasskeySession(email: string): {
  token: string;
  expiresAt: string;
  role: 'root-admin';
  email: string;
  authMethod: 'passkey';
} {
  assertAdminSeedConfigured();
  const now = Date.now();
  const expiresAtMs = now + env.ADMIN_TOKEN_TTL_MINUTES * 60_000;
  const payload: RootAdminTokenPayload = {
    role: 'root-admin',
    iat: now,
    exp: expiresAtMs,
    email,
    authMethod: 'passkey',
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

  return {
    token: `${encodedPayload}.${signToken(encodedPayload)}`,
    expiresAt: new Date(expiresAtMs).toISOString(),
    role: 'root-admin',
    email,
    authMethod: 'passkey',
  };
}

export async function requestAdminAuthOtp(input: { email: string }): Promise<{
  challengeId: string;
  email: string;
  expiresAt: string;
  delivery: 'smtp' | 'log';
  devOtp?: string;
}> {
  assertAdminSeedConfigured();
  cleanupExpiredChallenges();
  const email = normalizeAdminEmail(input.email);
  assertAdminEmailAllowed(email);

  const challengeId = randomBytes(16).toString('hex');
  const otp = randomInt(100000, 1_000_000).toString();
  const expiresAt = new Date(Date.now() + env.ADMIN_OTP_TTL_MINUTES * 60_000).toISOString();
  pendingAdminOtpChallenges.set(challengeId, {
    id: challengeId,
    email,
    otpHash: hashOtp(challengeId, otp),
    createdAt: new Date().toISOString(),
    expiresAt,
    attempts: 0,
  });

  const delivery = await sendAdminAuthOtpEmail({ email, otp, expiresAt });
  return {
    challengeId,
    email,
    expiresAt,
    delivery,
    devOtp: env.NODE_ENV === 'production' ? undefined : otp,
  };
}

export async function verifyAdminAuthOtp(input: { challengeId: string; otp: string }): Promise<{
  email: string;
  verified: true;
  verificationToken: string;
  expiresAt: string;
}> {
  assertAdminSeedConfigured();
  cleanupExpiredChallenges();
  const challenge = pendingAdminOtpChallenges.get(input.challengeId);
  if (!challenge) {
    throw new AdminAuthError(404, 'admin_otp_challenge_not_found', 'Admin OTP challenge not found');
  }

  if (Date.parse(challenge.expiresAt) <= Date.now()) {
    pendingAdminOtpChallenges.delete(input.challengeId);
    throw new AdminAuthError(410, 'admin_otp_challenge_expired', 'Admin OTP challenge expired');
  }

  challenge.attempts += 1;
  if (!secureEqualHex(challenge.otpHash, hashOtp(challenge.id, input.otp.trim()))) {
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
      pendingAdminOtpChallenges.delete(input.challengeId);
    }
    throw new AdminAuthError(401, 'invalid_admin_otp', 'Invalid admin OTP');
  }

  pendingAdminOtpChallenges.delete(input.challengeId);
  const verification = createAdminVerificationToken(challenge.email);
  return {
    email: challenge.email,
    verified: true,
    verificationToken: verification.token,
    expiresAt: verification.expiresAt,
  };
}

export async function generateAdminPasskeyRegistrationOptions(input: {
  email: string;
  verificationToken: string;
}): Promise<{ email: string; options: PublicKeyCredentialCreationOptionsJSON }> {
  assertAdminSeedConfigured();
  const email = normalizeAdminEmail(input.email);
  assertAdminEmailAllowed(email);
  verifyAdminVerificationToken(input.verificationToken, email);

  const store = await readAdminPasskeyStore();
  const existingCredentials = store.credentials.filter((credential) => credential.email === email);
  const challenge = createWebAuthnChallenge({
    email,
    type: 'registration',
    ttlMs: env.WEBAUTHN_TIMEOUT_REGISTRATION_MS,
  });

  const options = await generateRegistrationOptions({
    rpName: env.WEBAUTHN_RP_NAME,
    rpID: getWebAuthnRpId(),
    userName: email,
    userDisplayName: email,
    challenge: challenge.challenge,
    timeout: env.WEBAUTHN_TIMEOUT_REGISTRATION_MS,
    attestationType: 'none',
    excludeCredentials: existingCredentials.map((credential) => ({
      id: credential.credentialId,
      transports: credential.transports,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'required',
    },
  });
  options.challenge = challenge.challenge;
  return { email, options };
}

export async function verifyAdminPasskeyRegistration(input: {
  email: string;
  verificationToken: string;
  credential: RegistrationResponseJSON;
  deviceName?: string;
}): Promise<{
  email: string;
  credentialId: string;
  session: ReturnType<typeof createRootAdminPasskeySession>;
}> {
  assertAdminSeedConfigured();
  const email = normalizeAdminEmail(input.email);
  assertAdminEmailAllowed(email);
  verifyAdminVerificationToken(input.verificationToken, email);

  const challenge = parseClientChallenge(input.credential);
  verifyWebAuthnChallenge({ challenge, email, type: 'registration' });

  const verification = await verifyRegistrationResponse({
    response: input.credential,
    expectedChallenge: challenge,
    expectedOrigin: getWebAuthnOrigins(),
    expectedRPID: getWebAuthnRpId(),
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.registrationInfo?.credential) {
    throw new AdminAuthError(401, 'passkey_registration_failed', 'Passkey registration failed');
  }

  const { credential, credentialDeviceType, userVerified } = verification.registrationInfo;
  const store = await readAdminPasskeyStore();
  if (store.credentials.some((stored) => stored.credentialId === credential.id)) {
    throw new AdminAuthError(409, 'passkey_already_registered', 'Passkey is already registered');
  }

  const record: AdminPasskeyCredential = {
    id: randomUUID(),
    email,
    credentialId: credential.id,
    publicKeyCose: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    deviceName: input.deviceName?.trim() || credentialDeviceType || 'Passkey',
    transports: (input.credential.response.transports ?? []) as AuthenticatorTransportFuture[],
    userVerified,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };

  store.credentials.push(record);
  await writeAdminPasskeyStore(store);
  pendingAdminWebAuthnChallenges.delete(challenge);
  pendingAdminVerificationTokens.delete(input.verificationToken);

  return { email, credentialId: credential.id, session: createRootAdminPasskeySession(email) };
}

export async function generateAdminPasskeyAuthenticationOptions(input: {
  email?: string;
}): Promise<{ options: PublicKeyCredentialRequestOptionsJSON }> {
  assertAdminSeedConfigured();
  const email = input.email ? normalizeAdminEmail(input.email) : undefined;
  if (email) {
    assertAdminEmailAllowed(email);
  }

  const store = await readAdminPasskeyStore();
  const credentials = email ? store.credentials.filter((credential) => credential.email === email) : [];
  const challenge = createWebAuthnChallenge({
    email,
    type: 'authentication',
    ttlMs: env.WEBAUTHN_TIMEOUT_AUTHENTICATION_MS,
  });

  const options = await generateAuthenticationOptions({
    rpID: getWebAuthnRpId(),
    challenge: challenge.challenge,
    timeout: env.WEBAUTHN_TIMEOUT_AUTHENTICATION_MS,
    allowCredentials: credentials.length > 0
      ? credentials.map((credential) => ({
        id: credential.credentialId,
        transports: credential.transports,
      }))
      : undefined,
    userVerification: 'required',
  });
  options.challenge = challenge.challenge;
  return { options };
}

export async function verifyAdminPasskeyAuthentication(input: {
  credential: AuthenticationResponseJSON;
}): Promise<{
  email: string;
  credentialId: string;
  session: ReturnType<typeof createRootAdminPasskeySession>;
}> {
  assertAdminSeedConfigured();
  const challenge = parseClientChallenge(input.credential);
  verifyWebAuthnChallenge({ challenge, type: 'authentication' });

  const store = await readAdminPasskeyStore();
  const storedCredential = store.credentials.find((credential) => credential.credentialId === input.credential.id);
  if (!storedCredential) {
    throw new AdminAuthError(401, 'passkey_not_found', 'Passkey not found');
  }
  assertAdminEmailAllowed(storedCredential.email);

  const webAuthnCredential: WebAuthnCredential = {
    id: storedCredential.credentialId,
    publicKey: new Uint8Array(Buffer.from(storedCredential.publicKeyCose, 'base64url')),
    counter: storedCredential.counter,
    transports: storedCredential.transports,
  };

  const verification = await verifyAuthenticationResponse({
    response: input.credential,
    expectedChallenge: challenge,
    expectedOrigin: getWebAuthnOrigins(),
    expectedRPID: getWebAuthnRpId(),
    credential: webAuthnCredential,
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.authenticationInfo.userVerified) {
    throw new AdminAuthError(401, 'passkey_authentication_failed', 'Passkey authentication failed');
  }

  storedCredential.counter = verification.authenticationInfo.newCounter;
  storedCredential.lastUsedAt = new Date().toISOString();
  await writeAdminPasskeyStore(store);
  pendingAdminWebAuthnChallenges.delete(challenge);

  return {
    email: storedCredential.email,
    credentialId: storedCredential.credentialId,
    session: createRootAdminPasskeySession(storedCredential.email),
  };
}
