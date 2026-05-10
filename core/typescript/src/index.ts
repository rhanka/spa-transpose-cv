export const CORE_VERSION = '0.1.0-dev';

// Public types
export type {
  CvMime,
  InputFile,
  BrandTokens,
  Persistence,
  TemplateAssets,
  TransposeInput,
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

// DOCX helpers (Task 14)
export * from './docx/tools.js';
export * from './docx/reader.js';
export * from './docx/font-embedding.js';

// Text extraction (Task 16)
export * from './extract/text.js';

// Logger (Task 14)
export { defaultLogger } from './util/log.js';
export type { CoreLogger } from './util/log.js';
