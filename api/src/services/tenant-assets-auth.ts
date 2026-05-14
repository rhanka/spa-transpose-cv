import { createPublicKey, type JsonWebKey as NodeJsonWebKey, verify as verifySignature } from 'node:crypto';
import { getJwkForIssuerAndKid } from './jwks-cache.js';
import { normalizeTenantKey, TenantConfigError } from './tenant-config.js';

const ALLOWED_ISSUERS = new Set([
  'web-direct.cv-transpose.com',
  'ms-copilot.cv-transpose.com',
  'gemini-ent.cv-transpose.com',
]);

interface JwtHeader {
  alg?: string;
  kid?: string;
  typ?: string;
}

interface JwtClaims {
  iss: string;
  sub: string;
  tk: string;
  iat: number;
  exp: number;
}

function invalidJwt(reason: 'sig' | 'exp' | 'iss' | 'tk_mismatch'): TenantConfigError {
  return new TenantConfigError(401, 'invalid_jwt', reason);
}

function decodeBase64UrlJson<T>(value: string): T {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
  } catch {
    throw invalidJwt('sig');
  }
}

function parseBearerToken(authorization: string | undefined): string {
  if (!authorization?.startsWith('Bearer ')) {
    throw invalidJwt('sig');
  }

  const token = authorization.slice(7).trim();
  if (!token) {
    throw invalidJwt('sig');
  }
  return token;
}

function parseJwt(token: string): {
  header: JwtHeader;
  claims: JwtClaims;
  signingInput: string;
  signature: Buffer;
} {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw invalidJwt('sig');
  }

  const [encodedHeader, encodedClaims, encodedSignature] = parts;
  const header = decodeBase64UrlJson<JwtHeader>(encodedHeader);
  const claims = decodeBase64UrlJson<JwtClaims>(encodedClaims);

  return {
    header,
    claims,
    signingInput: `${encodedHeader}.${encodedClaims}`,
    signature: Buffer.from(encodedSignature, 'base64url'),
  };
}

function validateClaims(claims: JwtClaims, expectedTenantKey: string): JwtClaims {
  const issuer = claims.iss?.trim().toLowerCase();
  if (!issuer || !ALLOWED_ISSUERS.has(issuer)) {
    throw invalidJwt('iss');
  }

  if (typeof claims.sub !== 'string' || claims.sub.trim() === '') {
    throw invalidJwt('sig');
  }

  const normalizedTenantKey = normalizeTenantKey(expectedTenantKey);
  const normalizedClaimTenantKey = normalizeTenantKey(claims.tk);
  if (normalizedClaimTenantKey !== normalizedTenantKey) {
    throw invalidJwt('tk_mismatch');
  }

  if (!Number.isInteger(claims.iat) || !Number.isInteger(claims.exp)) {
    throw invalidJwt('exp');
  }

  if (claims.exp <= claims.iat || claims.exp - claims.iat > 300) {
    throw invalidJwt('exp');
  }

  const now = Math.floor(Date.now() / 1000);
  if (claims.exp <= now || claims.iat > now + 5) {
    throw invalidJwt('exp');
  }

  return {
    ...claims,
    iss: issuer,
    tk: normalizedClaimTenantKey,
  };
}

export async function authorizeTenantAssetRequest(
  authorization: string | undefined,
  expectedTenantKey: string,
): Promise<JwtClaims> {
  const token = parseBearerToken(authorization);
  const { header, claims, signingInput, signature } = parseJwt(token);

  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.trim() === '') {
    throw invalidJwt('sig');
  }

  const validatedClaims = validateClaims(claims, expectedTenantKey);
  const jwk = await getJwkForIssuerAndKid(validatedClaims.iss, header.kid);
  const publicKey = createPublicKey({ key: jwk as NodeJsonWebKey, format: 'jwk' });
  const valid = verifySignature('RSA-SHA256', Buffer.from(signingInput), publicKey, signature);

  if (!valid) {
    throw invalidJwt('sig');
  }

  return validatedClaims;
}
