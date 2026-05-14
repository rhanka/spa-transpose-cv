import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client, type GetObjectCommandOutput } from '@aws-sdk/client-s3';
import { z } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import {
  ensureTemplateContract,
  legacyTemplateSeedSchema,
  legacyThemeSeedSchema,
  templateRenderingSchema,
  templateVariantSchema,
  type TemplateContract,
  type TemplateRendering,
} from '@cv-transpose/core';

/**
 * Fallback rendering block used when a tenant config predates the inline
 * `rendering` block on disk. New tenants should always carry their own block;
 * this default exists only so legacy / partially-migrated configs stay
 * loadable.
 */
const DEFAULT_TENANT_RENDERING: TemplateRendering = {
  headerStyle: 'ats-minimal',
  sectionStyle: 'rule-caps',
  jobStyle: 'ats-plain',
};

export const DEFAULT_TENANT_SLUG = '_default';
export const RESERVED_TENANT_SLUGS = ['admin', 'api', 'session'] as const;
export const TENANT_KEY_PREFIXES = ['direct', 'ms', 'gws'] as const;

export type TenantKeyPrefix = typeof TENANT_KEY_PREFIXES[number];
export type TenantKey = `${TenantKeyPrefix}:${string}`;

const RESERVED_TENANT_SLUG_SET = new Set<string>(RESERVED_TENANT_SLUGS);
const TENANT_CONFIG_CACHE_TTL_MS = 30_000;
const TENANT_ASSET_CACHE_DIR = join(env.DATA_DIR, 'tenant-assets');
const tenantSlugSchema = z.string().trim().min(1).regex(/^[a-z0-9_][a-z0-9_-]*$/);
const tenantKeySchema = z.string().trim().regex(/^(direct|ms|gws):[a-z0-9._-]+$/);
const tenantIdentitySchema = z.object({
  provider: z.enum(TENANT_KEY_PREFIXES),
  subject: z.string().trim().min(1),
}).optional();
const tenantBrandingSchema = z.object({
  logoPath: z.string().trim().min(1).optional(),
  faviconPath: z.string().trim().min(1).optional(),
  subtitle: z.string().trim().min(1).optional(),
  heroBackground: z.string().trim().min(1).optional(),
  shellBackground: z.string().trim().min(1).optional(),
}).optional();
const rawTenantConfigSchema = z.object({
  slug: tenantSlugSchema,
  tenantKey: tenantKeySchema.optional(),
  identity: tenantIdentitySchema,
  displayName: z.string().trim().min(1),
  routeBase: z.string().trim().min(1),
  brandUrl: z.string().url(),
  themeKey: z.string().trim().min(1),
  templateKey: z.string().trim().min(1),
  templateContractVersion: z.string().trim().min(1),
  variant: templateVariantSchema,
  active: z.boolean(),
  theme: legacyThemeSeedSchema,
  branding: tenantBrandingSchema,
  template: legacyTemplateSeedSchema.optional(),
  rendering: templateRenderingSchema.optional(),
  // Raw, untyped templateContract: parsed through the strict
  // templateContractSchema in ensureTemplateContract(). Tenant configs are
  // expected to carry their own `rendering` block here directly.
  templateContract: z.unknown().optional(),
});

type RawTenantConfig = z.infer<typeof rawTenantConfigSchema>;

export interface TenantConfig extends Omit<RawTenantConfig, 'templateContract'> {
  tenantKey: TenantKey;
  templateContract: TemplateContract;
}

interface TenantRegistryRecord {
  version: 'v1';
  tenants: Array<{
    slug: string;
    displayName: string;
    active: boolean;
    configKey: string;
    tenantKey?: string;
  }>;
}

interface CachedTenantConfig {
  expiresAt: number;
  value: TenantConfig;
}

interface CachedTenantAssetPath {
  expiresAt: number;
  value: string;
}

const tenantConfigCache = new Map<string, CachedTenantConfig>();
const tenantAssetPathCache = new Map<string, CachedTenantAssetPath>();

let tenantS3Client: S3Client | null = null;

export class TenantConfigError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TenantConfigError';
  }
}

export function normalizeTenantSlug(input?: string | null): string {
  if (!input || input.trim() === '') {
    return DEFAULT_TENANT_SLUG;
  }

  const slug = input.trim().toLowerCase();
  const parsed = tenantSlugSchema.safeParse(slug);
  if (!parsed.success) {
    throw new TenantConfigError(400, 'invalid_tenant_slug', `Invalid tenant slug "${input}"`);
  }

  if (RESERVED_TENANT_SLUG_SET.has(parsed.data)) {
    throw new TenantConfigError(400, 'reserved_tenant_slug', `Reserved tenant slug "${parsed.data}"`);
  }

  return parsed.data;
}

export function deriveDirectTenantKey(slug: string): TenantKey {
  return `direct:${normalizeTenantSlug(slug)}`;
}

export function normalizeTenantKey(input: string): TenantKey {
  const normalized = input.trim().toLowerCase();
  const parsed = tenantKeySchema.safeParse(normalized);
  if (!parsed.success) {
    throw new TenantConfigError(400, 'invalid_tenant_key', `Invalid tenant key "${input}"`);
  }
  return parsed.data as TenantKey;
}

function splitTenantKey(tenantKey: TenantKey): {
  provider: TenantKeyPrefix;
  subject: string;
} {
  const [provider, ...rest] = tenantKey.split(':');
  return {
    provider: provider as TenantKeyPrefix,
    subject: rest.join(':'),
  };
}

export function resolveTenantSlug(options: {
  explicitSlug?: string | null;
  headerTenant?: string | null;
}): string {
  return normalizeTenantSlug(options.explicitSlug ?? options.headerTenant ?? DEFAULT_TENANT_SLUG);
}

function hydrateTenantConfig(config: RawTenantConfig): TenantConfig {
  const tenantKey = config.tenantKey
    ? normalizeTenantKey(config.tenantKey)
    : deriveDirectTenantKey(config.slug);
  const identity = config.identity ?? splitTenantKey(tenantKey);

  return {
    ...config,
    tenantKey,
    identity,
    templateContract: ensureTemplateContract({
      templateContractVersion: config.templateContractVersion,
      variant: config.variant,
      theme: config.theme,
      template: config.template,
      templateContract: config.templateContract,
      defaultRendering: config.rendering ?? DEFAULT_TENANT_RENDERING,
    }),
  };
}

function splitTenantAssetKey(assetKey: string): string[] {
  const key = assetKey.trim().replace(/^\/+/, '');
  if (!key) {
    throw new TenantConfigError(500, 'invalid_tenant_asset_key', 'Tenant asset key cannot be empty');
  }

  const segments = key.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new TenantConfigError(500, 'invalid_tenant_asset_key', `Invalid tenant asset key "${assetKey}"`);
  }

  return segments;
}

function normalizeTenantAssetKey(assetKey: string): string {
  return splitTenantAssetKey(assetKey).join('/');
}

function isS3StorageEnabled(): boolean {
  return env.TENANT_STORAGE_BACKEND === 's3';
}

function getTenantS3Client(): S3Client {
  if (!isS3StorageEnabled()) {
    throw new TenantConfigError(500, 'tenant_storage_misconfigured', 'S3 tenant storage is not enabled');
  }

  if (!env.TENANT_S3_BUCKET || !env.TENANT_S3_ACCESS_KEY || !env.TENANT_S3_SECRET_KEY) {
    throw new TenantConfigError(500, 'tenant_storage_misconfigured', 'Missing S3 tenant storage configuration');
  }

  if (!tenantS3Client) {
    tenantS3Client = new S3Client({
      region: env.TENANT_S3_REGION,
      endpoint: env.TENANT_S3_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.TENANT_S3_ACCESS_KEY,
        secretAccessKey: env.TENANT_S3_SECRET_KEY,
      },
    });
  }

  return tenantS3Client;
}

function getTenantS3ObjectKey(assetKey: string): string {
  const normalizedKey = normalizeTenantAssetKey(assetKey);
  const prefix = env.TENANT_S3_PREFIX.trim().replace(/^\/+|\/+$/g, '');
  return prefix ? `${prefix}/${normalizedKey}` : normalizedKey;
}

async function objectBodyToBuffer(body: GetObjectCommandOutput['Body']): Promise<Buffer> {
  if (!body) {
    return Buffer.alloc(0);
  }

  if (typeof body.transformToByteArray === 'function') {
    return Buffer.from(await body.transformToByteArray());
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function resolveTenantAssetPath(assetKey: string): string {
  return join(process.cwd(), 'templates', ...splitTenantAssetKey(assetKey));
}

export async function readStorageObjectBuffer(objectKey: string): Promise<Buffer> {
  const normalizedKey = normalizeTenantAssetKey(objectKey);

  if (!isS3StorageEnabled()) {
    const assetPath = resolveTenantAssetPath(normalizedKey);
    try {
      return await readFile(assetPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new TenantConfigError(404, 'tenant_asset_not_found', `Tenant asset "${normalizedKey}" not found`);
      }
      throw error;
    }
  }

  try {
    const response = await getTenantS3Client().send(new GetObjectCommand({
      Bucket: env.TENANT_S3_BUCKET,
      Key: getTenantS3ObjectKey(normalizedKey),
    }));
    return await objectBodyToBuffer(response.Body);
  } catch (error) {
    const code = (error as { name?: string; Code?: string }).name ?? (error as { Code?: string }).Code;
    const statusCode = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (code === 'NoSuchKey' || statusCode === 404) {
      throw new TenantConfigError(404, 'tenant_asset_not_found', `Tenant asset "${normalizedKey}" not found`);
    }

    logger.error({ err: error, assetKey: normalizedKey }, 'Failed to read tenant asset from S3');
    throw new TenantConfigError(500, 'tenant_storage_unavailable', `Failed to load tenant asset "${normalizedKey}"`);
  }
}

export async function readStorageObjectText(objectKey: string): Promise<string> {
  const buffer = await readStorageObjectBuffer(objectKey);
  return buffer.toString('utf8');
}

async function loadTenantRegistryFromStorage(): Promise<TenantRegistryRecord> {
  let raw: string;
  try {
    raw = await readStorageObjectText('registry.json');
  } catch (error) {
    if (error instanceof TenantConfigError && error.code === 'tenant_asset_not_found') {
      return { version: 'v1', tenants: [] };
    }
    throw error;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new TenantConfigError(500, 'invalid_tenant_registry_json', 'Tenant registry has invalid JSON');
  }

  const parsedRegistry = z.object({
    version: z.literal('v1'),
    tenants: z.array(z.object({
      slug: tenantSlugSchema,
      displayName: z.string().trim().min(1),
      active: z.boolean(),
      configKey: z.string().trim().min(1),
      tenantKey: tenantKeySchema.optional(),
    })),
  }).safeParse(parsedJson);

  if (!parsedRegistry.success) {
    throw new TenantConfigError(500, 'invalid_tenant_registry_schema', 'Tenant registry has an invalid schema');
  }

  return parsedRegistry.data;
}

async function resolveTenantSlugFromTenantKey(tenantKey: TenantKey): Promise<string> {
  const { provider, subject } = splitTenantKey(tenantKey);
  if (provider === 'direct') {
    return normalizeTenantSlug(subject);
  }

  const registry = await loadTenantRegistryFromStorage();
  const match = registry.tenants.find((tenant) => normalizeTenantKey(
    tenant.tenantKey ?? deriveDirectTenantKey(tenant.slug),
  ) === tenantKey);

  if (!match) {
    throw new TenantConfigError(404, 'tenant_not_found', `Tenant "${tenantKey}" not found`);
  }

  return match.slug;
}

async function loadTenantConfigFromStorage(slug: string): Promise<TenantConfig> {
  const configAssetKey = `tenants/${slug}/config.json`;

  let raw: string;
  try {
    raw = await readStorageObjectText(configAssetKey);
  } catch (error) {
    if (error instanceof TenantConfigError && error.code === 'tenant_asset_not_found') {
      throw new TenantConfigError(404, 'tenant_not_found', `Tenant "${slug}" not found`);
    }
    throw error;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new TenantConfigError(500, 'invalid_tenant_config_json', `Tenant "${slug}" has invalid JSON`);
  }

  const parsedConfig = rawTenantConfigSchema.safeParse(parsedJson);
  if (!parsedConfig.success) {
    throw new TenantConfigError(500, 'invalid_tenant_config_schema', `Tenant "${slug}" has an invalid config schema`);
  }

  const config = hydrateTenantConfig(parsedConfig.data);

  if (config.slug !== slug) {
    throw new TenantConfigError(500, 'tenant_slug_mismatch', `Tenant config slug mismatch for "${slug}"`);
  }

  if (!config.active) {
    throw new TenantConfigError(404, 'tenant_inactive', `Tenant "${slug}" is inactive`);
  }

  return config;
}

export async function getTenantConfig(options: {
  explicitSlug?: string | null;
  headerTenant?: string | null;
}): Promise<TenantConfig> {
  const slug = resolveTenantSlug(options);
  const now = Date.now();
  const cached = tenantConfigCache.get(slug);

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const config = await loadTenantConfigFromStorage(slug);
  tenantConfigCache.set(slug, {
    expiresAt: now + TENANT_CONFIG_CACHE_TTL_MS,
    value: config,
  });

  return config;
}

export async function getTenantConfigByTenantKey(tenantKey: string): Promise<TenantConfig> {
  const normalizedTenantKey = normalizeTenantKey(tenantKey);
  const slug = await resolveTenantSlugFromTenantKey(normalizedTenantKey);
  const config = await getTenantConfig({ explicitSlug: slug });

  if (normalizeTenantKey(config.tenantKey) !== normalizedTenantKey) {
    throw new TenantConfigError(404, 'tenant_not_found', `Tenant "${tenantKey}" not found`);
  }

  return config;
}

function isPreconditionFailure(error: unknown): boolean {
  const code = (error as { name?: string; Code?: string }).name ?? (error as { Code?: string }).Code;
  const statusCode = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  return code === 'PreconditionFailed' || code === 'ConditionalRequestConflict' || statusCode === 412 || statusCode === 409;
}

export async function writeStorageObjectBuffer(
  objectKey: string,
  payload: Buffer,
  options?: {
    contentType?: string;
    ifNoneMatch?: boolean;
  },
): Promise<void> {
  const normalizedKey = normalizeTenantAssetKey(objectKey);

  if (!isS3StorageEnabled()) {
    const filePath = resolveTenantAssetPath(normalizedKey);
    await mkdir(dirname(filePath), { recursive: true });

    if (options?.ifNoneMatch) {
      try {
        await stat(filePath);
        throw new TenantConfigError(409, 'storage_object_exists', `Storage object "${normalizedKey}" already exists`);
      } catch (error) {
        if (error instanceof TenantConfigError) {
          throw error;
        }
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    }

    await writeFile(filePath, payload);
    return;
  }

  try {
    await getTenantS3Client().send(new PutObjectCommand({
      Bucket: env.TENANT_S3_BUCKET,
      Key: getTenantS3ObjectKey(normalizedKey),
      Body: payload,
      ContentType: options?.contentType,
      IfNoneMatch: options?.ifNoneMatch ? '*' : undefined,
    }));
  } catch (error) {
    if (isPreconditionFailure(error)) {
      throw new TenantConfigError(409, 'storage_object_exists', `Storage object "${normalizedKey}" already exists`);
    }

    logger.error({ err: error, objectKey: normalizedKey }, 'Failed to write storage object');
    throw new TenantConfigError(500, 'tenant_storage_write_failed', `Failed to write storage object "${normalizedKey}"`);
  }
}

export async function writeStorageObjectText(
  objectKey: string,
  payload: string,
  options?: {
    contentType?: string;
    ifNoneMatch?: boolean;
  },
): Promise<void> {
  await writeStorageObjectBuffer(objectKey, Buffer.from(payload, 'utf8'), {
    contentType: options?.contentType ?? 'application/json; charset=utf-8',
    ifNoneMatch: options?.ifNoneMatch,
  });
}

async function materializeTenantAsset(assetKey: string): Promise<string> {
  const normalizedKey = normalizeTenantAssetKey(assetKey);

  if (!isS3StorageEnabled()) {
    return resolveTenantAssetPath(normalizedKey);
  }

  const now = Date.now();
  const cached = tenantAssetPathCache.get(normalizedKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const filePath = join(TENANT_ASSET_CACHE_DIR, ...splitTenantAssetKey(normalizedKey));
  const fileData = await readStorageObjectBuffer(normalizedKey);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, fileData);

  tenantAssetPathCache.set(normalizedKey, {
    expiresAt: now + TENANT_CONFIG_CACHE_TTL_MS,
    value: filePath,
  });

  return filePath;
}

export async function getTenantTemplatePath(config: TenantConfig): Promise<string> {
  return materializeTenantAsset(config.templateKey);
}

export function clearTenantConfigCache(): void {
  tenantConfigCache.clear();
  tenantAssetPathCache.clear();
}
