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

// Template manifest validator (Task 6)
export {
  validateTemplateManifest,
} from './template/manifest.js';
export type {
  TemplateManifest,
  Section,
  SectionKind,
  Slot,
  ValidationResult,
} from './template/manifest.js';

// DOCX helpers (Task 14)
export * from './docx/tools.js';
export * from './docx/reader.js';
export * from './docx/font-embedding.js';

// Logger (Task 14)
export { defaultLogger } from './util/log.js';
export type { CoreLogger } from './util/log.js';
