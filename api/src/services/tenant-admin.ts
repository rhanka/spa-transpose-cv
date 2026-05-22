import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { forceClaimAsRootAdmin, createRootAdminSession, getClaimStatus, verifyClaimOtp, AdminAuthError } from './admin-auth.js';
import { scrapeBrandTheme } from './brand-scraper-agent.js';
import { extractTextFromDocxBuffer } from '@cv-transpose/core';
import { analyzeTemplateDocx, type TemplateAnalysisProfile } from './template-analysis-agent.js';
import {
  clearTenantConfigCache,
  deriveDirectTenantKey,
  getTenantConfigForAdmin,
  readStorageObjectText,
  TenantConfigError,
  type TenantConfig,
  writeStorageObjectBuffer,
  writeStorageObjectText,
} from './tenant-config.js';

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

function buildThemeCss(theme: Record<string, string>): string {
  return [
    ':root {',
    `  --color-purple-dark: ${theme.primaryDark};`,
    `  --color-purple: ${theme.primaryColor};`,
    `  --color-purple-light: ${theme.primaryColor};`,
    `  --color-purple-lighter: ${theme.primaryDark};`,
    `  --color-purple-border: ${theme.surfaceBorder};`,
    `  --color-purple-bg: ${theme.surfaceSubtle};`,
    `  --color-green: ${theme.accentColor};`,
    `  --color-green-hover: ${theme.accentHover};`,
    `  --color-gradient-start: ${theme.primaryDark};`,
    `  --color-gradient-end: ${theme.accentColor};`,
    `  --font-heading: "${theme.fontHeading}";`,
    `  --font-body: "${theme.fontBody}";`,
    `  --radius-base: ${theme.borderRadius};`,
    '}',
  ].join('\n');
}

function cleanDisplayName(siteName: string, fallbackSlug: string): string {
  const compact = siteName
    .split(/[\|\-–—]/)
    .map((part) => part.trim())
    .find((part) => part.length >= 2 && part.length <= 32);

  if (compact) {
    return compact;
  }

  return fallbackSlug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

async function inferTemplateProfile(templateBuffer: Buffer): Promise<TemplateAnalysisProfile> {
  const text = (await extractTextFromDocxBuffer(templateBuffer)).toUpperCase();
  if (
    text.includes('SKILLS SUMMARY')
    || text.includes('SELECTED EXPERIENCE')
    || text.includes('INDUSTRY EXPERIENCE')
  ) {
    return 'cgi';
  }
  return 'scalian';
}

async function upsertRegistryEntry(entry: {
  slug: string;
  displayName: string;
  active: boolean;
  configKey: string;
  tenantKey: string;
}): Promise<void> {
  let registry: TenantRegistryRecord = {
    version: 'v1',
    tenants: [],
  };

  try {
    registry = JSON.parse(await readStorageObjectText('registry.json')) as TenantRegistryRecord;
  } catch {
    registry = {
      version: 'v1',
      tenants: [],
    };
  }

  const nextTenants = registry.tenants.filter((tenant) => tenant.slug !== entry.slug);
  nextTenants.push(entry);
  nextTenants.sort((left, right) => left.slug.localeCompare(right.slug));

  await writeStorageObjectText('registry.json', JSON.stringify({
    version: 'v1',
    tenants: nextTenants,
  }, null, 2));
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/g, '');
}

function sortTenantRecords(
  left: TenantRegistryRecord['tenants'][number],
  right: TenantRegistryRecord['tenants'][number],
): number {
  return left.slug < right.slug ? -1 : left.slug > right.slug ? 1 : 0;
}

async function loadTenantRegistryForAdmin(): Promise<TenantRegistryRecord> {
  let raw: string;
  try {
    raw = await readStorageObjectText('registry.json');
  } catch (error) {
    if (error instanceof TenantConfigError && error.code === 'tenant_asset_not_found') {
      return { version: 'v1', tenants: [] };
    }
    throw error;
  }

  try {
    return JSON.parse(raw) as TenantRegistryRecord;
  } catch {
    throw new TenantConfigError(500, 'invalid_tenant_registry_json', 'Tenant registry has invalid JSON');
  }
}

export interface TenantMarketplacePublication {
  slug: string;
  displayName: string;
  active: boolean;
  status: 'draft' | 'published';
  tenantKey: string;
  assets: {
    manifestUrl: string;
    baseDocxUrl: string;
    brandUrl: string;
    authTenantClaim: 'tk';
  };
}

function buildTenantMarketplacePublication(
  config: TenantConfig,
  assetsBaseUrl: string,
): TenantMarketplacePublication {
  const baseUrl = normalizeBaseUrl(assetsBaseUrl);
  const encodedTenantKey = encodeURIComponent(config.tenantKey);
  const tenantAssetsBaseUrl = `${baseUrl}/api/v1/tenants/${encodedTenantKey}`;

  return {
    slug: config.slug,
    displayName: config.displayName,
    active: config.active,
    status: config.active ? 'published' : 'draft',
    tenantKey: config.tenantKey,
    assets: {
      manifestUrl: `${tenantAssetsBaseUrl}/manifest`,
      baseDocxUrl: `${tenantAssetsBaseUrl}/base.docx`,
      brandUrl: `${tenantAssetsBaseUrl}/brand`,
      authTenantClaim: 'tk',
    },
  };
}

export async function getTenantMarketplacePublication(input: {
  slug: string;
  assetsBaseUrl: string;
}): Promise<TenantMarketplacePublication> {
  const config = await getTenantConfigForAdmin({ explicitSlug: input.slug });
  return buildTenantMarketplacePublication(config, input.assetsBaseUrl);
}

export async function listTenantMarketplacePublications(input: {
  assetsBaseUrl: string;
}): Promise<{ tenants: TenantMarketplacePublication[] }> {
  const registry = await loadTenantRegistryForAdmin();
  const tenants = await Promise.all(
    [...registry.tenants]
      .sort(sortTenantRecords)
      .map((tenant) => getTenantMarketplacePublication({
        slug: tenant.slug,
        assetsBaseUrl: input.assetsBaseUrl,
      })),
  );

  return { tenants };
}

export async function createTenantFromAdminFlow(input: {
  companyUrl: string;
  corporateEmail: string;
  templateFileName: string;
  templateBuffer: Buffer;
  challengeId?: string;
  otp?: string;
  rootAdminPassword?: string;
  slug?: string;
}): Promise<{
  slug: string;
  displayName: string;
  active: boolean;
  routeBase: string;
  tenantKeyPrefix: string;
  templateProfile: TemplateAnalysisProfile;
  companyUrl: string;
}> {
  const rootAdminPassword = input.rootAdminPassword?.trim();
  let claimedSlug = input.slug?.trim().toLowerCase() || '';

  if (rootAdminPassword) {
    createRootAdminSession(rootAdminPassword);
    const claim = await forceClaimAsRootAdmin({
      companyUrl: input.companyUrl,
      corporateEmail: input.corporateEmail,
      slug: input.slug,
    });
    claimedSlug = claim.slug;
  } else {
    if (!input.challengeId || !input.otp) {
      throw new AdminAuthError(400, 'missing_claim_verification', 'challengeId and otp are required');
    }
    const claim = await verifyClaimOtp({
      challengeId: input.challengeId,
      otp: input.otp,
    });
    claimedSlug = claim.slug;
  }

  const templateProfile = await inferTemplateProfile(input.templateBuffer);
  const tempDir = join(env.DATA_DIR, 'admin-drafts');
  const tempDocxPath = join(tempDir, `${Date.now()}-${input.templateFileName.replace(/[^a-zA-Z0-9._-]+/g, '_')}`);

  await mkdir(tempDir, { recursive: true });
  await writeFile(tempDocxPath, input.templateBuffer);

  try {
    const [brand, templateAnalysis] = await Promise.all([
      scrapeBrandTheme(input.companyUrl),
      analyzeTemplateDocx(tempDocxPath, templateProfile),
    ]);

    const claim = claimedSlug ? await getClaimStatus(claimedSlug) : null;
    const slug = claim?.slug
      || claimedSlug
      || new URL(input.companyUrl).hostname.split('.').slice(-2, -1)[0]
      || brand.siteName.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    const displayName = cleanDisplayName(brand.siteName, slug);
    const active = Boolean(rootAdminPassword);
    const routeBase = `/${slug}/`;
    const tenantKeyPrefix = `tenants/${slug}`;
    const tenantKey = deriveDirectTenantKey(slug);

    const config = {
      slug,
      tenantKey,
      identity: {
        provider: 'direct',
        subject: slug,
      },
      displayName,
      routeBase,
      brandUrl: brand.finalUrl,
      themeKey: `${tenantKeyPrefix}/theme.css`,
      templateKey: `${tenantKeyPrefix}/template.docx`,
      templateContractVersion: templateAnalysis.templateContract.version,
      variant: templateAnalysis.templateContract.layout.variant,
      active,
      theme: brand.mappedTheme,
      branding: {
        logoPath: brand.logoUrl ?? undefined,
        faviconPath: brand.logoUrl ?? undefined,
        subtitle: active ? 'Mise en forme de CV' : 'Brouillon en préparation',
        heroBackground: brand.mappedTheme.primaryDark,
        shellBackground: brand.mappedTheme.primaryDark,
      },
      templateContract: templateAnalysis.templateContract,
    };

    await writeStorageObjectBuffer(`${tenantKeyPrefix}/template.docx`, input.templateBuffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    await writeStorageObjectText(`${tenantKeyPrefix}/theme.css`, buildThemeCss(brand.mappedTheme), {
      contentType: 'text/css; charset=utf-8',
    });
    await writeStorageObjectText(`${tenantKeyPrefix}/config.json`, JSON.stringify(config, null, 2));
    await writeStorageObjectText(`${tenantKeyPrefix}/brand-analysis.json`, JSON.stringify(brand, null, 2));
    await writeStorageObjectText(`${tenantKeyPrefix}/template-analysis.json`, JSON.stringify(templateAnalysis, null, 2));
    await upsertRegistryEntry({
      slug,
      displayName,
      active,
      configKey: `${tenantKeyPrefix}/config.json`,
      tenantKey,
    });
    clearTenantConfigCache();

    return {
      slug,
      displayName,
      active,
      routeBase,
      tenantKeyPrefix,
      templateProfile,
      companyUrl: brand.finalUrl,
    };
  } finally {
    await rm(tempDocxPath, { force: true }).catch(() => {
      logger.warn({ tempDocxPath }, 'Failed to clean temporary admin template');
    });
  }
}
