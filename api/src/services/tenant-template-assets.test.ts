import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  ensureTemplateContract,
  validateTemplateManifest,
  type TemplateContract,
  type TemplateRendering,
} from '@cv-transpose/core';
import { tenantConfigToTemplateAssets } from './tenant-template-assets.js';
import type { TenantConfig } from './tenant-config.js';

const DEFAULT_RENDERING: TemplateRendering = {
  headerStyle: 'ats-minimal',
  sectionStyle: 'rule-caps',
  jobStyle: 'ats-plain',
};

function loadScalianTenantConfig(): TenantConfig {
  const configPath = fileURLToPath(new URL('../../templates/tenants/scalian/config.json', import.meta.url));
  const raw = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;

  const templateContract: TemplateContract = ensureTemplateContract({
    templateContractVersion: raw.templateContractVersion as string,
    variant: raw.variant as string,
    theme: raw.theme as Record<string, string>,
    template: raw.template as Record<string, unknown>,
    templateContract: raw.templateContract,
    defaultRendering: DEFAULT_RENDERING,
  });

  return {
    slug: raw.slug as string,
    displayName: raw.displayName as string,
    routeBase: raw.routeBase as string,
    brandUrl: raw.brandUrl as string,
    themeKey: raw.themeKey as string,
    templateKey: raw.templateKey as string,
    templateContractVersion: raw.templateContractVersion as string,
    variant: raw.variant as TenantConfig['variant'],
    active: raw.active as boolean,
    theme: raw.theme as TenantConfig['theme'],
    branding: raw.branding as TenantConfig['branding'],
    template: raw.template as TenantConfig['template'],
    rendering: raw.rendering as TenantConfig['rendering'],
    templateContract,
  };
}

// Minimal PK-zip magic header — enough to make sure baseDocx flows through
// unchanged. The bridge itself never inspects the bytes.
const DUMMY_DOCX_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

test('tenantConfigToTemplateAssets produces a manifest that passes validateTemplateManifest', () => {
  const tenantConfig = loadScalianTenantConfig();

  const assets = tenantConfigToTemplateAssets(tenantConfig, DUMMY_DOCX_BYTES);

  assert.equal(assets.manifest.version, '1.0');
  assert.equal(assets.manifest.tenantKey, 'direct:scalian');
  assert.equal(assets.manifest.naming, 'Scalian_Profile_{name}.docx');
  assert.equal(assets.baseDocx, DUMMY_DOCX_BYTES);
  assert.equal(assets.baseDocx.length, DUMMY_DOCX_BYTES.length);

  // Section ids must be preserved verbatim (manifestToContract relies on this
  // round-trip property).
  const sectionIds = assets.manifest.sections.map((section) => section.id);
  assert.deepEqual(sectionIds, [
    'technicalSkills',
    'sectorSkills',
    'experience',
    'languages',
    'education',
  ]);

  // Section kinds must come from the coarser manifest taxonomy.
  const sectionKinds = assets.manifest.sections.map((section) => section.kind);
  assert.deepEqual(sectionKinds, [
    'skills',
    'skills',
    'experiences',
    'languages',
    'education',
  ]);

  const validation = validateTemplateManifest(assets.manifest);
  assert.equal(
    validation.ok,
    true,
    validation.ok ? '' : `manifest failed validation: ${validation.errors.join('; ')}`,
  );
});

test('tenantConfigToTemplateAssets derives brand tokens from templateContract.styleTokens', () => {
  const tenantConfig = loadScalianTenantConfig();

  const assets = tenantConfigToTemplateAssets(tenantConfig, DUMMY_DOCX_BYTES);

  // Scalian's runtime default now points at the legacy renderer, but the
  // generic UAT path still receives Scalian-like tokens through the manifest.
  assert.equal(assets.brand.primary, '#7030A0');
  assert.equal(assets.brand.secondary, '#7030A0');
  assert.equal(assets.brand.accent, '#7030A0');
  assert.equal(assets.brand.fontFamily, 'Cambria');

  // Rendering hints are forwarded too: this matters for the OOXML renderer
  // downstream of transpose().
  assert.equal(assets.manifest.rendering?.headerStyle, 'ats-minimal');
  assert.equal(assets.manifest.rendering?.sectionStyle, 'classic-band');
  assert.equal(assets.manifest.rendering?.jobStyle, 'classic-consulting');
  assert.equal(assets.manifest.rendering?.colors?.accent, '#7030A0');
  assert.equal(assets.manifest.rendering?.fonts?.heading, 'Cambria');
});
