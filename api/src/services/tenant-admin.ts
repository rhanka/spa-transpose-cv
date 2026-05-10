import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { forceClaimAsRootAdmin, createRootAdminSession, getClaimStatus, verifyClaimOtp, AdminAuthError } from './admin-auth.js';
import { scrapeBrandTheme } from './brand-scraper-agent.js';
import { extractTextFromDocxBuffer } from '@cv-transpose/core';
import { analyzeTemplateDocx, type TemplateAnalysisProfile } from './template-analysis-agent.js';
import { clearTenantConfigCache, readStorageObjectText, writeStorageObjectBuffer, writeStorageObjectText } from './tenant-config.js';

interface TenantRegistryRecord {
  version: 'v1';
  tenants: Array<{
    slug: string;
    displayName: string;
    active: boolean;
    configKey: string;
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

    const config = {
      slug,
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
