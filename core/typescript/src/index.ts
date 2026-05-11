export const CORE_VERSION = '0.1.0-dev';

// Public types
export type {
  CvMime,
  InputFile,
  BrandTokens,
  Persistence,
  TemplateAssets,
  TransposeInput,
  TransposePhase,
  DetectedFields,
  AlignmentReport,
  TransposedCv,
  TransposeOutput,
} from './types.js';

// LlmProvider (will be created in Task 12, re-exported here)
export type { LlmProvider, LlmCompleteArgs, LlmCompleteResult } from './llm.js';

// Template manifest validator (Task 6) + rendering hints (Task 18)
export {
  validateTemplateManifest,
  DEFAULT_RENDERING,
} from './template/manifest.js';
export type {
  TemplateManifest,
  Section,
  SectionKind,
  Slot,
  ValidationResult,
  RenderingHints,
  RenderingHeaderStyle,
  RenderingSectionStyle,
  RenderingJobStyle,
} from './template/manifest.js';

// Template contract (Task 17) — schema + helpers for the per-tenant
// template contract document.
export {
  templateVariantSchema,
  templateHeaderStyleSchema,
  templateSectionStyleSchema,
  templateJobStyleSchema,
  templateHeaderFieldKeySchema,
  templateSectionKeySchema,
  templateRenderingSchema,
  templateContractSchema,
  legacyTemplateSeedSchema,
  legacyThemeSeedSchema,
  buildLegacyTemplateContract,
  ensureTemplateContract,
  getRequiredSectionLabels,
  getPrimaryExperienceSectionLabel,
  getPrimarySectorSectionLabel,
  deriveOutputNameFromTemplateContract,
  validateCvDataAgainstTemplateContract,
} from './template/contract.js';
export type {
  TemplateVariant,
  TemplateSectionKey,
  TemplateHeaderStyle,
  TemplateSectionStyle,
  TemplateJobStyle,
  TemplateRendering,
  TemplateContract,
} from './template/contract.js';

// CV profile (Task 17) — used by template contract validation; lives in core
// so the contract has no api-side type dependency.
export { cvDataSchema } from './cv/profile.js';
export type { CvData } from './cv/profile.js';

// DOCX helpers (Task 14)
export * from './docx/tools.js';
export * from './docx/reader.js';
export * from './docx/font-embedding.js';

// Text extraction (Task 16)
export * from './extract/text.js';

// Page 1 validation (Task 20) — saturation-safe LibreOffice page-1 overflow
// check. Used by the api orchestrator after building the DOCX.
export * from './validate/page1.js';

// DOCX structure validation (P1.5-bis Task 3) — checks that required section
// labels are present in a rendered DOCX. Replaces the api orchestrator's
// previous direct use of `validateDocxBuffer` from docx/reader.ts with a
// clean core API that operates on in-memory bytes.
export * from './validate/docx-structure.js';

// Template renderer (Task 18b) — OOXML rendering driven by the template
// contract's rendering hints. Consumed by transpose() in core (Task 21) and
// re-exported through the api shim at services/template-xml.ts.
export * from './template/render.js';

// Manifest → contract bridge (Task 21) — converts a public TemplateManifest
// into the richer TemplateContract the renderer consumes. Used by transpose()
// and by language ports (P1.4 / P1.5) that need the same conversion.
export { manifestToContract } from './template/bridge.js';

// Transpose pipeline (Task 21) — the keystone Contract 1 entry point.
export { transpose } from './transpose.js';

// Logger (Task 14)
export { defaultLogger } from './util/log.js';
export type { CoreLogger } from './util/log.js';
