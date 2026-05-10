import Ajv from 'ajv';
import schema from '../../../../core/spec/template-manifest-v1.json' assert { type: 'json' };

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);

export interface Slot {
  paragraphIndex: number;
  runIndex: number;
  maxChars?: number;
}

export type SectionKind =
  | 'experiences'
  | 'education'
  | 'skills'
  | 'languages'
  | 'certifications'
  | 'narrative';

export interface Section {
  id: string;
  kind: SectionKind;
  label: string;
  anchorParagraphIndex?: number;
  maxItems?: number;
  itemTemplateRef?: string;
}

export type RenderingHeaderStyle =
  | 'ats-minimal'
  | 'simple-clean'
  | 'compact-split'
  | 'modern-band'
  | 'professional-classic'
  | 'brand-accent';

export type RenderingSectionStyle =
  | 'rule-caps'
  | 'subtle-label'
  | 'compact-rule'
  | 'filled-bar'
  | 'classic-band'
  | 'centered-rule'
  | 'left-accent';

export type RenderingJobStyle =
  | 'ats-plain'
  | 'simple-balanced'
  | 'modern-emphasis'
  | 'classic-consulting'
  | 'compact-dense';

/**
 * Style hints a renderer needs to translate a CV into DOCX/PDF for a given
 * tenant. Replaces the legacy `template-variant-catalog` lookup, so that
 * rendering decisions live entirely inside the per-tenant manifest.
 *
 * All fields are optional — renderers should fall back to {@link DEFAULT_RENDERING}
 * (or their own neutral defaults) when a field is absent. This keeps older
 * tenant configs renderable while new tenants migrate.
 */
export interface RenderingHints {
  headerStyle?: RenderingHeaderStyle;
  sectionStyle?: RenderingSectionStyle;
  jobStyle?: RenderingJobStyle;
  /** Hex color tokens (e.g. `#RRGGBB`). Conventional keys: accent, sectionBannerFill, sectionBannerText, headingText, bodyText, mutedText. */
  colors?: Record<string, string>;
  /** Font family tokens. Conventional keys: heading, body. Numeric values are tolerated for size-style tokens. */
  fonts?: Record<string, string | number>;
  /** Spacing tokens in twips (1/20 pt). Conventional keys: sectionBeforeTwip, sectionAfterTwip, lineTwip. */
  spacing?: Record<string, string | number>;
  /** Per-section label overrides, keyed by section key. */
  sectionLabelOverrides?: Record<string, string>;
}

/**
 * Neutral fallback rendering for tenants whose manifest does not yet declare
 * a `rendering` block. Mirrors the legacy "ats-core" defaults at a high level
 * and is intentionally conservative — concrete tenants should override.
 */
export const DEFAULT_RENDERING: RenderingHints = {
  headerStyle: 'ats-minimal',
  sectionStyle: 'rule-caps',
  jobStyle: 'ats-plain',
  colors: {
    accent: '#1F2937',
    sectionBannerFill: '#FFFFFF',
    sectionBannerText: '#111827',
    headingText: '#111827',
    bodyText: '#111827',
  },
  fonts: {
    heading: 'Liberation Sans Narrow',
    body: 'Liberation Sans Narrow',
  },
  spacing: {
    sectionBeforeTwip: 180,
    sectionAfterTwip: 100,
    lineTwip: 280,
  },
};

export interface TemplateManifest {
  version: '1.0';
  tenantKey: string;
  naming: string;
  header: {
    nameSlot: Slot;
    titleLine1Slot: Slot;
    titleLine2Slot: Slot;
  };
  sections: Section[];
  validationRulesRef?: string;
  rendering?: RenderingHints;
}

export type ValidationResult =
  | { ok: true; manifest: TemplateManifest }
  | { ok: false; errors: string[] };

export function validateTemplateManifest(input: unknown): ValidationResult {
  if (validate(input)) {
    return { ok: true, manifest: input as unknown as TemplateManifest };
  }
  return {
    ok: false,
    errors: (validate.errors ?? []).map(e => `${e.instancePath} ${e.message}`)
  };
}
