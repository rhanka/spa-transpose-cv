/**
 * Bridge — convert a {@link TemplateManifest} (the public contract that
 * tenants ship) into a {@link TemplateContract} (the richer internal shape
 * the renderer consumes).
 *
 * The manifest is intentionally minimal: it carries enough information to
 * locate header slots, list sections, and choose rendering hints. The
 * contract carries everything the OOXML renderer needs (style tokens,
 * filename pattern, header field placeholders, per-section required/repeatable
 * flags, layout variant).
 *
 * This bridge is conservative about lossy paths and documents them inline:
 *
 * - `header.fields[].placeholder` — manifest doesn't carry placeholders, so we
 *   use generic ones. They are only consumed when the renderer needs to fall
 *   back; real values come from the extracted CV.
 * - `layout.variant` — synthesised from `manifest.rendering.headerStyle` (see
 *   `headerStyleToVariant`). The renderer dispatches on `layout.variant` for
 *   special layouts (consulting-classic, executive-modern, professional-compact,
 *   brand-accent); for the common single-column case it falls through to the
 *   generic ATS path.
 * - `header.limits` — taken from the manifest's title slots when present;
 *   otherwise generic defaults. The renderer enforces these as soft warnings,
 *   never hard truncation.
 * - `output.filenamePattern` — from `manifest.naming` directly (1:1 mapping).
 *
 * Sections in the manifest carry an `id` that, by convention, matches a
 * {@link TemplateSectionKey}. When the manifest evolves to allow ids that are
 * NOT contract keys (e.g. tenant-specific sections), this bridge rejects them
 * loudly so we don't silently drop content. That's intentional: a section
 * the renderer can't handle must be made explicit, not papered over.
 */

import type { BrandTokens } from '../types.js';
import type {
  Section as ManifestSection,
  TemplateManifest,
} from './manifest.js';
import {
  type TemplateContract,
  type TemplateHeaderStyle,
  type TemplateJobStyle,
  type TemplateSectionStyle,
  type TemplateVariant,
  type TemplateSectionKey,
  templateContractSchema,
  templateSectionKeySchema,
} from './contract.js';

const DEFAULT_HEADER_STYLE: TemplateHeaderStyle = 'ats-minimal';
const DEFAULT_SECTION_STYLE: TemplateSectionStyle = 'rule-caps';
const DEFAULT_JOB_STYLE: TemplateJobStyle = 'ats-plain';

/**
 * Map manifest header styles to a layout variant the renderer dispatches on.
 * The `brand-accent` header style aligns with the `brand-accent` variant
 * (which has a richer keystone-style document body); other header styles
 * fall through to the generic single-column ATS body.
 */
function headerStyleToVariant(style: TemplateHeaderStyle | undefined): TemplateVariant {
  switch (style) {
    case 'brand-accent':
      return 'brand-accent';
    case 'professional-classic':
      return 'consulting-classic';
    case 'modern-band':
      return 'executive-modern';
    case 'compact-split':
      return 'professional-compact';
    case 'simple-clean':
    case 'ats-minimal':
    default:
      return 'ats-core';
  }
}

/**
 * Build the per-section list of `{ key, label, required, repeatable }`. The
 * manifest's `id` is treated as the contract key when it parses; otherwise we
 * throw — silently dropping a section would mask a real misconfiguration.
 */
function buildContractSections(
  manifestSections: ManifestSection[],
): TemplateContract['sections'] {
  if (manifestSections.length === 0) {
    throw new Error('manifestToContract: manifest has zero sections');
  }

  return manifestSections.map((section) => {
    const parsed = templateSectionKeySchema.safeParse(section.id);
    if (!parsed.success) {
      throw new Error(
        `manifestToContract: section id "${section.id}" is not a known TemplateSectionKey. ` +
        `Either rename the section id to a known key (e.g. technicalSkills, sectorSkills, experience, languages, education) ` +
        `or extend the contract schema to accept tenant-specific keys.`
      );
    }
    const key: TemplateSectionKey = parsed.data;

    return {
      key,
      label: section.label,
      // `required` is only used for hard-failure validation today; manifests
      // don't carry that information explicitly. Treat any section the tenant
      // chose to declare as required, so the renderer warns when the LLM
      // returns no content for it.
      required: true,
      repeatable: key === 'experience' || key === 'selectedExperience' || key === 'additionalExperience',
    };
  });
}

/**
 * Convert a {@link TemplateManifest} (+ optional brand tokens) into a fully
 * validated {@link TemplateContract} suitable for the OOXML renderer.
 *
 * Throws if the manifest cannot be losslessly bridged (e.g. a section id that
 * isn't a known contract key, or rendering hints that produce a value the
 * contract schema rejects). The thrown error names the offending field so
 * tenants can fix the manifest.
 */
export function manifestToContract(
  manifest: TemplateManifest,
  brand?: BrandTokens,
): TemplateContract {
  const rendering = manifest.rendering ?? {};
  const headerStyle: TemplateHeaderStyle =
    (rendering.headerStyle as TemplateHeaderStyle) ?? DEFAULT_HEADER_STYLE;
  const sectionStyle: TemplateSectionStyle =
    (rendering.sectionStyle as TemplateSectionStyle) ?? DEFAULT_SECTION_STYLE;
  const jobStyle: TemplateJobStyle =
    (rendering.jobStyle as TemplateJobStyle) ?? DEFAULT_JOB_STYLE;

  // Style tokens: take everything the manifest declares verbatim, then ensure
  // the renderer's well-known keys exist with sensible fallbacks. The brand
  // tokens (if provided) supply default colors/font when the manifest is
  // silent, so a tenant who only ships brand tokens still gets a coherent
  // render.
  const colors: Record<string, string> = {
    accent: brand?.primary ?? '#1F2937',
    sectionBannerFill: '#FFFFFF',
    sectionBannerText: brand?.primary ?? '#111827',
    headingText: brand?.primary ?? '#111827',
    bodyText: '#111827',
    mutedText: brand?.secondary ?? '#5B6470',
    ...(rendering.colors ?? {}),
  };
  const fonts: Record<string, string | number> = {
    heading: brand?.fontFamily ?? 'Liberation Sans Narrow',
    body: brand?.fontFamily ?? 'Liberation Sans Narrow',
    ...(rendering.fonts ?? {}),
  };
  const spacing: Record<string, string | number> = {
    sectionBeforeTwip: 180,
    sectionAfterTwip: 100,
    lineTwip: 280,
    ...(rendering.spacing ?? {}),
  };

  // Header field placeholders: the manifest's slot maxChars (when present)
  // tunes the renderer's overflow check. The placeholder text itself is
  // never used at render time for real CVs (the LLM-extracted values
  // override). Keep them generic.
  const headlineMax = manifest.header.titleLine1Slot.maxChars ?? 40;
  const subheadlineMax = manifest.header.titleLine2Slot.maxChars ?? 40;

  const contract = {
    version: 'v1' as const,
    layout: {
      family: 'single-column' as const,
      variant: headerStyleToVariant(headerStyle),
    },
    header: {
      fields: [
        { key: 'name' as const, placeholder: 'Candidate Name' },
        { key: 'headline' as const, placeholder: 'Role' },
        { key: 'subheadline' as const, placeholder: 'Specialty' },
        { key: 'years_of_experience' as const, placeholder: 'XX' },
      ],
      limits: {
        headlineMaxChars: headlineMax,
        subheadlineMaxChars: subheadlineMax,
      },
    },
    sections: buildContractSections(manifest.sections),
    styleTokens: {
      colors,
      fonts,
      spacing,
    },
    rendering: {
      headerStyle,
      sectionStyle,
      jobStyle,
    },
    output: {
      filenamePattern: manifest.naming,
    },
  };

  return templateContractSchema.parse(contract);
}
