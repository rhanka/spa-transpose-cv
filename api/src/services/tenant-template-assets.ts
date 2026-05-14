/**
 * Bridge — convert a {@link TenantConfig} (and the bytes of its base DOCX
 * template) into a {@link TemplateAssets} value suitable for `core.transpose()`.
 *
 * The api stores tenants as `TenantConfig` (rich on-disk JSON: legacy header
 * fields, theme, branding, plus the strongly-typed `templateContract` produced
 * by `ensureTemplateContract`). `core.transpose()` consumes the lighter-weight
 * public `TemplateAssets` shape (`manifest` + `baseDocx` + `brand`).
 *
 * Mapping decisions (each one called out so future readers can audit them):
 *
 * - `manifest.version` → fixed `'1.0'` (the only schema currently supported).
 * - `manifest.tenantKey` → `direct:<tenantSlug>`. The manifest schema requires
 *   the `direct|ms|gws:` prefix; tenants loaded through this bridge are
 *   first-party (not marketplace-distributed), so `direct:` is correct.
 * - `manifest.naming` → `templateContract.output.filenamePattern` (1:1).
 * - `manifest.header.*Slot` → synthesised. The on-disk contract does not (yet)
 *   carry OOXML paragraph/run indices for header slots; the renderer in core
 *   doesn't actually consume these indices when going through
 *   `manifestToContract` (placeholders are overridden by extracted CV data
 *   at render time). We emit conservative defaults with the contract's
 *   header limits attached as `maxChars` so manifest validation passes.
 * - `manifest.sections[]` → mapped from `templateContract.sections[]`. Each
 *   contract `key` is preserved verbatim as `manifest.section.id` (this is
 *   exactly what `manifestToContract` expects when bridging back), and the
 *   `kind` is derived via `contractSectionKeyToKind`.
 * - `manifest.rendering` → forwarded from `templateContract.rendering`,
 *   enriched with the contract's `styleTokens` (colors, fonts, spacing).
 *   Manifest schema constraints: `colors` values must be `#RRGGBB` hex; we
 *   filter out any non-conforming entries to keep validation green.
 * - `brand` → derived from `styleTokens.colors` and `styleTokens.fonts`.
 *
 * The bridge throws when the contract is missing a piece that has no
 * defensible synthesis (none today; all required fields have safe defaults).
 */

import type {
  BrandTokens,
  Section,
  SectionKind,
  Slot,
  TemplateAssets,
  TemplateManifest,
} from '@cv-transpose/core';
import type { TemplateSectionKey } from '@cv-transpose/core';
import type { TenantConfig } from './tenant-config.js';

/**
 * Map a {@link TemplateSectionKey} (contract-level identifier) to a
 * {@link SectionKind} (manifest-level category). Manifest kinds are a coarser
 * taxonomy: many contract keys collapse into `skills` or `experiences`.
 */
function contractSectionKeyToKind(key: TemplateSectionKey): SectionKind {
  switch (key) {
    case 'technicalSkills':
    case 'coreSkills':
    case 'sectorSkills':
    case 'tools':
      return 'skills';
    case 'experience':
    case 'selectedExperience':
    case 'additionalExperience':
    case 'sectorExperience':
      return 'experiences';
    case 'languages':
      return 'languages';
    case 'education':
      return 'education';
    case 'executiveSummary':
      return 'narrative';
    default: {
      // Exhaustiveness check: if a new contract key is added without updating
      // this map, TypeScript will flag it. We still fall back to 'narrative'
      // at runtime so the bridge never throws for an extension.
      const _exhaustive: never = key;
      void _exhaustive;
      return 'narrative';
    }
  }
}

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

/**
 * The manifest schema is strict about color tokens: they must be 6-digit hex
 * with a leading `#`. The contract permits any string; we sanitise here to
 * avoid producing a manifest that fails validation purely because a tenant
 * used a non-conforming color token (e.g. a named color or short hex).
 */
function sanitizeColors(input: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!input) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string' && HEX_COLOR_RE.test(value)) {
      out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Header slots are conservative defaults — see file-level docblock. */
function buildHeaderSlots(headlineMax: number, subheadlineMax: number): TemplateManifest['header'] {
  const nameSlot: Slot = { paragraphIndex: 0, runIndex: 0, maxChars: 80 };
  const titleLine1Slot: Slot = { paragraphIndex: 1, runIndex: 0, maxChars: headlineMax };
  const titleLine2Slot: Slot = { paragraphIndex: 2, runIndex: 0, maxChars: subheadlineMax };
  return { nameSlot, titleLine1Slot, titleLine2Slot };
}

/**
 * Convert a {@link TenantConfig} (already hydrated through
 * `ensureTemplateContract`) and the bytes of its base DOCX into a
 * {@link TemplateAssets} value that `core.transpose()` consumes.
 *
 * The returned manifest is guaranteed to pass `validateTemplateManifest` —
 * the test suite enforces this invariant.
 */
export function tenantConfigToTemplateManifest(tenantConfig: TenantConfig): TemplateManifest {
  const contract = tenantConfig.templateContract;

  const header = buildHeaderSlots(
    contract.header.limits.headlineMaxChars,
    contract.header.limits.subheadlineMaxChars,
  );

  const sections: Section[] = contract.sections.map((section) => ({
    id: section.key,
    kind: contractSectionKeyToKind(section.key),
    label: section.label,
  }));

  const sanitizedColors = sanitizeColors(contract.styleTokens.colors);

  return {
    version: '1.0',
    tenantKey: tenantConfig.tenantKey ?? `direct:${tenantConfig.slug}`,
    naming: contract.output.filenamePattern,
    header,
    sections,
    rendering: {
      headerStyle: contract.rendering.headerStyle,
      sectionStyle: contract.rendering.sectionStyle,
      jobStyle: contract.rendering.jobStyle,
      ...(sanitizedColors ? { colors: sanitizedColors } : {}),
      ...(contract.styleTokens.fonts ? { fonts: contract.styleTokens.fonts } : {}),
      ...(contract.styleTokens.spacing ? { spacing: contract.styleTokens.spacing } : {}),
    },
    validationRulesRef: 'default',
  };
}

export function tenantConfigToBrandTokens(tenantConfig: TenantConfig): BrandTokens {
  const contract = tenantConfig.templateContract;
  const colors = contract.styleTokens.colors ?? {};
  const fontHeading = contract.styleTokens.fonts?.heading;
  const fontBody = contract.styleTokens.fonts?.body;
  return {
    primary: colors.headingText ?? colors.accent ?? '#111827',
    secondary: colors.mutedText ?? colors.bodyText ?? '#5B6470',
    accent: colors.accent ?? '#1F2937',
    fontFamily: typeof fontBody === 'string'
      ? fontBody
      : typeof fontHeading === 'string'
        ? fontHeading
        : 'Liberation Sans Narrow',
  };
}

export function tenantConfigToTemplateAssets(
  tenantConfig: TenantConfig,
  baseDocx: Uint8Array,
): TemplateAssets {
  return {
    manifest: tenantConfigToTemplateManifest(tenantConfig),
    baseDocx,
    brand: tenantConfigToBrandTokens(tenantConfig),
  };
}
