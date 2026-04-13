import { createHmac, pbkdf2Sync, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import {
  normalizeTenantSlug,
  readStorageObjectText,
  TenantConfigError,
  writeStorageObjectText,
} from './tenant-config.js';

const OTP_MAX_ATTEMPTS = 5;
const COMMON_SUBDOMAINS = new Set(['www', 'app', 'careers', 'jobs', 'fr', 'en', 'ca', 'us']);
const COMMON_SECOND_LEVEL_TLDS = new Set(['co', 'com', 'org', 'net', 'gov', 'edu']);

interface RootAdminTokenPayload {
  role: 'root-admin';
  iat: number;
  exp: number;
}

interface PendingClaimChallenge {
  id: string;
  slug: string;
  companyUrl: string;
  companyDomain: string;
  corporateEmail: string;
  emailDomain: string;
  otpHash: string;
  createdAt: string;
  expiresAt: string;
  attempts: number;
}

interface ClaimRecord {
  version: 'v1';
  slug: string;
  companyUrl: string;
  companyDomain: string;
  emailHash: string;
  claimedAt: string;
  claimedBy: 'space-claimant' | 'root-admin';
}

export class AdminAuthError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AdminAuthError';
  }
}

const pendingClaimChallenges = new Map<string, PendingClaimChallenge>();
let mailTransporter: Transporter | null | undefined;

function getAdminSalt(): string {
  return env.ADMIN_PASSWORD_SALT ?? env.ADMIN_SEED_SECRET ?? '';
}

function getAdminSeedSecret(): string {
  return env.ADMIN_SEED_SECRET ?? env.ADMIN_PASSWORD_SALT ?? '';
}

function assertAdminSecretsConfigured(requirePasswordHash = false): void {
  if (!getAdminSeedSecret()) {
    throw new AdminAuthError(503, 'admin_seed_secret_missing', 'Admin seed secret is not configured');
  }

  if (requirePasswordHash && (!env.ADMIN_PASSWORD_HASH || !getAdminSalt())) {
    throw new AdminAuthError(503, 'admin_password_config_missing', 'Admin password hash is not configured');
  }
}

function deriveHex(value: string, salt: string): string {
  return pbkdf2Sync(value, salt, 210_000, 32, 'sha256').toString('hex');
}

function secureEqualHex(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function signToken(encodedPayload: string): string {
  return createHmac('sha256', getAdminSeedSecret()).update(encodedPayload).digest('base64url');
}

function parseEmailDomain(email: string): string {
  const parts = email.trim().toLowerCase().split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1] || !parts[1].includes('.')) {
    throw new AdminAuthError(400, 'invalid_corporate_email', `Invalid corporate email "${email}"`);
  }
  return parts[1];
}

function isTenantConfigAlreadyPresentError(error: unknown): boolean {
  return error instanceof TenantConfigError && error.code === 'tenant_asset_not_found';
}

function normalizeCompanyUrl(input: string): URL {
  const trimmed = input.trim();
  const withProtocol = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new AdminAuthError(400, 'invalid_company_url', `Invalid company URL "${input}"`);
  }

  if (!parsed.hostname || !parsed.hostname.includes('.')) {
    throw new AdminAuthError(400, 'invalid_company_url', `Invalid company URL "${input}"`);
  }

  parsed.hash = '';
  parsed.search = '';
  return parsed;
}

function getCompanyRootDomain(hostname: string): string {
  const labels = hostname.toLowerCase().split('.').filter(Boolean);
  while (labels.length > 2 && COMMON_SUBDOMAINS.has(labels[0])) {
    labels.shift();
  }

  if (labels.length <= 2) {
    return labels.join('.');
  }

  const secondLast = labels[labels.length - 2];
  if (COMMON_SECOND_LEVEL_TLDS.has(secondLast) && labels.length >= 3) {
    return labels.slice(-3).join('.');
  }

  return labels.slice(-2).join('.');
}

function deriveSlugFromHostname(hostname: string): string {
  const labels = hostname.toLowerCase().split('.').filter(Boolean);
  while (labels.length > 2 && COMMON_SUBDOMAINS.has(labels[0])) {
    labels.shift();
  }

  let baseIndex = labels.length - 2;
  if (labels.length >= 3 && COMMON_SECOND_LEVEL_TLDS.has(labels[labels.length - 2])) {
    baseIndex = labels.length - 3;
  }

  const candidate = (labels[baseIndex] ?? labels[0] ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .toLowerCase();

  return normalizeTenantSlug(candidate);
}

function hashOtp(challengeId: string, otp: string): string {
  return createHmac('sha256', getAdminSeedSecret()).update(`${challengeId}:${otp}`).digest('hex');
}

function hashEmail(email: string): string {
  return createHmac('sha256', getAdminSeedSecret()).update(email.trim().toLowerCase()).digest('hex');
}

function cleanupExpiredChallenges(): void {
  const now = Date.now();
  for (const [id, challenge] of pendingClaimChallenges.entries()) {
    if (Date.parse(challenge.expiresAt) <= now) {
      pendingClaimChallenges.delete(id);
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

async function sendOtpEmail(params: {
  corporateEmail: string;
  otp: string;
  slug: string;
  companyUrl: string;
  expiresAt: string;
}): Promise<'smtp' | 'log'> {
  const transporter = getMailer();
  if (!transporter) {
    logger.info({
      email: params.corporateEmail,
      slug: params.slug,
      otp: params.otp,
      expiresAt: params.expiresAt,
    }, 'Claim OTP generated without SMTP transport');
    return 'log';
  }

  await transporter.sendMail({
    from: env.SMTP_FROM ?? 'cv-transpose@sent-tech.local',
    to: params.corporateEmail,
    subject: `CV Transpose OTP - ${params.slug}`,
    text: [
      `OTP: ${params.otp}`,
      `Slug: ${params.slug}`,
      `Company URL: ${params.companyUrl}`,
      `Expires at: ${params.expiresAt}`,
    ].join('\n'),
  });

  return 'smtp';
}

async function assertSlugNotAlreadyUsed(slug: string): Promise<void> {
  try {
    await readStorageObjectText(`tenants/${slug}/config.json`);
    throw new AdminAuthError(409, 'claim_slug_already_taken', `Slug "${slug}" is already claimed`);
  } catch (error) {
    if (error instanceof AdminAuthError) {
      throw error;
    }
    if (!isTenantConfigAlreadyPresentError(error)) {
      throw error;
    }
  }
}

function normalizeClaimRequest(input: {
  companyUrl: string;
  corporateEmail: string;
  slug?: string;
}, options?: {
  allowEmailDomainMismatch?: boolean;
}) {
  const companyUrl = normalizeCompanyUrl(input.companyUrl);
  const companyDomain = getCompanyRootDomain(companyUrl.hostname);
  const derivedSlug = deriveSlugFromHostname(companyUrl.hostname);
  const requestedSlug = input.slug ? normalizeTenantSlug(input.slug) : derivedSlug;
  if (requestedSlug !== derivedSlug) {
    throw new AdminAuthError(400, 'slug_domain_mismatch', 'Slug must match the company domain');
  }

  const corporateEmail = input.corporateEmail.trim().toLowerCase();
  const emailDomain = parseEmailDomain(corporateEmail);
  const emailMatchesCompany = emailDomain === companyDomain || emailDomain.endsWith(`.${companyDomain}`);
  if (!emailMatchesCompany && !options?.allowEmailDomainMismatch) {
    throw new AdminAuthError(400, 'corporate_email_domain_mismatch', 'Corporate email does not match the company domain');
  }

  return {
    slug: requestedSlug,
    companyUrl: companyUrl.toString(),
    companyDomain,
    corporateEmail,
    emailDomain,
  };
}

function getClaimObjectKey(slug: string): string {
  return `claims/${slug}.json`;
}

function createClaimRecord(input: {
  slug: string;
  companyUrl: string;
  companyDomain: string;
  corporateEmail: string;
  claimedBy: 'space-claimant' | 'root-admin';
}): ClaimRecord {
  return {
    version: 'v1',
    slug: input.slug,
    companyUrl: input.companyUrl,
    companyDomain: input.companyDomain,
    emailHash: hashEmail(input.corporateEmail),
    claimedAt: new Date().toISOString(),
    claimedBy: input.claimedBy,
  };
}

export function createRootAdminSession(password: string): {
  token: string;
  expiresAt: string;
  role: 'root-admin';
} {
  assertAdminSecretsConfigured(true);

  const hashedPassword = deriveHex(password, getAdminSalt());
  if (!env.ADMIN_PASSWORD_HASH || !secureEqualHex(hashedPassword, env.ADMIN_PASSWORD_HASH)) {
    throw new AdminAuthError(401, 'invalid_admin_password', 'Invalid admin password');
  }

  const now = Date.now();
  const expiresAtMs = now + env.ADMIN_TOKEN_TTL_MINUTES * 60_000;
  const payload: RootAdminTokenPayload = {
    role: 'root-admin',
    iat: now,
    exp: expiresAtMs,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const token = `${encodedPayload}.${signToken(encodedPayload)}`;

  return {
    token,
    expiresAt: new Date(expiresAtMs).toISOString(),
    role: 'root-admin',
  };
}

export function verifyRootAdminToken(token: string): RootAdminTokenPayload {
  assertAdminSecretsConfigured();

  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) {
    throw new AdminAuthError(401, 'invalid_admin_token', 'Invalid admin token');
  }

  const expectedSignature = signToken(encodedPayload);
  if (signature !== expectedSignature) {
    throw new AdminAuthError(401, 'invalid_admin_token', 'Invalid admin token');
  }

  let payload: RootAdminTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as RootAdminTokenPayload;
  } catch {
    throw new AdminAuthError(401, 'invalid_admin_token', 'Invalid admin token');
  }

  if (payload.role !== 'root-admin' || typeof payload.exp !== 'number' || payload.exp <= Date.now()) {
    throw new AdminAuthError(401, 'expired_admin_token', 'Admin token expired');
  }

  return payload;
}

export async function requestClaimOtp(input: {
  companyUrl: string;
  corporateEmail: string;
  slug?: string;
}): Promise<{
  challengeId: string;
  slug: string;
  companyDomain: string;
  expiresAt: string;
  delivery: 'smtp' | 'log';
  devOtp?: string;
}> {
  assertAdminSecretsConfigured();
  cleanupExpiredChallenges();

  const normalized = normalizeClaimRequest(input);
  await assertSlugNotAlreadyUsed(normalized.slug);
  const existingClaim = await getClaimStatus(normalized.slug);
  if (existingClaim) {
    throw new AdminAuthError(409, 'claim_slug_already_taken', `Slug "${normalized.slug}" is already claimed`);
  }

  const challengeId = randomBytes(16).toString('hex');
  const otp = randomInt(100000, 1_000_000).toString();
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + env.ADMIN_OTP_TTL_MINUTES * 60_000).toISOString();

  pendingClaimChallenges.set(challengeId, {
    id: challengeId,
    slug: normalized.slug,
    companyUrl: normalized.companyUrl,
    companyDomain: normalized.companyDomain,
    corporateEmail: normalized.corporateEmail,
    emailDomain: normalized.emailDomain,
    otpHash: hashOtp(challengeId, otp),
    createdAt,
    expiresAt,
    attempts: 0,
  });

  const delivery = await sendOtpEmail({
    corporateEmail: normalized.corporateEmail,
    otp,
    slug: normalized.slug,
    companyUrl: normalized.companyUrl,
    expiresAt,
  });

  return {
    challengeId,
    slug: normalized.slug,
    companyDomain: normalized.companyDomain,
    expiresAt,
    delivery,
    devOtp: env.NODE_ENV === 'production' ? undefined : otp,
  };
}

export async function verifyClaimOtp(input: {
  challengeId: string;
  otp: string;
}): Promise<{
  slug: string;
  claimKey: string;
  claimedAt: string;
  status: 'claimed';
}> {
  assertAdminSecretsConfigured();
  cleanupExpiredChallenges();

  const challenge = pendingClaimChallenges.get(input.challengeId);
  if (!challenge) {
    throw new AdminAuthError(404, 'claim_challenge_not_found', 'Claim challenge not found');
  }

  if (Date.parse(challenge.expiresAt) <= Date.now()) {
    pendingClaimChallenges.delete(input.challengeId);
    throw new AdminAuthError(410, 'claim_challenge_expired', 'Claim challenge expired');
  }

  challenge.attempts += 1;
  if (challenge.otpHash !== hashOtp(challenge.id, input.otp.trim())) {
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
      pendingClaimChallenges.delete(input.challengeId);
    }
    throw new AdminAuthError(401, 'invalid_claim_otp', 'Invalid OTP');
  }

  const claimKey = getClaimObjectKey(challenge.slug);
  const claim = createClaimRecord({
    slug: challenge.slug,
    companyUrl: challenge.companyUrl,
    companyDomain: challenge.companyDomain,
    corporateEmail: challenge.corporateEmail,
    claimedBy: 'space-claimant',
  });

  try {
    await writeStorageObjectText(claimKey, JSON.stringify(claim, null, 2), {
      ifNoneMatch: true,
    });
  } catch (error) {
    if (error instanceof TenantConfigError && error.code === 'storage_object_exists') {
      throw new AdminAuthError(409, 'claim_slug_already_taken', `Slug "${challenge.slug}" is already claimed`);
    }
    throw error;
  } finally {
    pendingClaimChallenges.delete(input.challengeId);
  }

  return {
    slug: challenge.slug,
    claimKey,
    claimedAt: claim.claimedAt,
    status: 'claimed',
  };
}

export async function forceClaimAsRootAdmin(input: {
  companyUrl: string;
  corporateEmail: string;
  slug?: string;
}): Promise<{
  slug: string;
  claimKey: string;
  claimedAt: string;
  status: 'claimed';
}> {
  assertAdminSecretsConfigured();
  const normalized = normalizeClaimRequest(input, { allowEmailDomainMismatch: true });
  await assertSlugNotAlreadyUsed(normalized.slug);
  const claimKey = getClaimObjectKey(normalized.slug);
  const claim = createClaimRecord({
    slug: normalized.slug,
    companyUrl: normalized.companyUrl,
    companyDomain: normalized.companyDomain,
    corporateEmail: normalized.corporateEmail,
    claimedBy: 'root-admin',
  });

  await writeStorageObjectText(claimKey, JSON.stringify(claim, null, 2));
  return {
    slug: normalized.slug,
    claimKey,
    claimedAt: claim.claimedAt,
    status: 'claimed',
  };
}

export async function getClaimStatus(slug: string): Promise<ClaimRecord | null> {
  const normalizedSlug = normalizeTenantSlug(slug);
  try {
    const raw = await readStorageObjectText(getClaimObjectKey(normalizedSlug));
    return JSON.parse(raw) as ClaimRecord;
  } catch (error) {
    if (error instanceof TenantConfigError && error.code === 'tenant_asset_not_found') {
      return null;
    }
    throw error;
  }
}
