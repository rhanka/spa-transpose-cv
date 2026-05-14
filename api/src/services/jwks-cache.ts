import type { JsonWebKey as NodeJsonWebKey } from 'node:crypto';
import { TenantConfigError } from './tenant-config.js';

const JWKS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CachedJwks {
  expiresAt: number;
  keysByKid: Map<string, NodeJsonWebKey & { kid: string }>;
}

const jwksCache = new Map<string, CachedJwks>();

function normalizeIssuer(issuer: string): string {
  return issuer.trim().toLowerCase();
}

function getJwksUrl(issuer: string): string {
  return `https://${normalizeIssuer(issuer)}/.well-known/jwks.json`;
}

async function fetchIssuerJwks(issuer: string): Promise<CachedJwks> {
  const response = await fetch(getJwksUrl(issuer));
  if (!response.ok) {
    throw new TenantConfigError(401, 'invalid_jwt', 'Failed to fetch JWKS');
  }

  const payload = await response.json() as { keys?: Array<NodeJsonWebKey & { kid?: string }> };
  if (!Array.isArray(payload.keys)) {
    throw new TenantConfigError(401, 'invalid_jwt', 'JWKS payload is invalid');
  }

  const keysByKid = new Map<string, NodeJsonWebKey & { kid: string }>();
  for (const key of payload.keys) {
    if (typeof key?.kid === 'string' && key.kid.length > 0) {
      keysByKid.set(key.kid, { ...key, kid: key.kid });
    }
  }

  return {
    expiresAt: Date.now() + JWKS_CACHE_TTL_MS,
    keysByKid,
  };
}

export async function getJwkForIssuerAndKid(issuer: string, kid: string): Promise<NodeJsonWebKey & { kid: string }> {
  const normalizedIssuer = normalizeIssuer(issuer);
  const now = Date.now();
  const cached = jwksCache.get(normalizedIssuer);

  if (cached && cached.expiresAt > now && cached.keysByKid.has(kid)) {
    return cached.keysByKid.get(kid) as NodeJsonWebKey & { kid: string };
  }

  const refreshed = await fetchIssuerJwks(normalizedIssuer);
  jwksCache.set(normalizedIssuer, refreshed);

  const key = refreshed.keysByKid.get(kid);
  if (!key) {
    throw new TenantConfigError(401, 'invalid_jwt', `Unknown kid "${kid}"`);
  }

  return key;
}

export function clearJwksCache(): void {
  jwksCache.clear();
}
