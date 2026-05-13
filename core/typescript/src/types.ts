// Public types of @cv-transpose/core — Contract 1 (TS port).
// See spec/SPEC_EVOL_MULTI_MARKETPLACE_INTERFACES.md for the canonical text.
// Python port (P1.2) mirrors these names in snake_case.

export type CvMime =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'application/msword';

export interface InputFile {
  name: string;
  bytes: Uint8Array;
  mime: CvMime;
  /** Optional per-CV user prompt (target-company tailoring, retry feedback).
   *  Substituted in place of `${userPrompt}` in the user prompt template. */
  userPromptOverride?: string;
}

export type TransposePhase =
  | 'extract-text'
  | 'extract-cv-llm'
  | 'render-docx'
  | 'validate-page1'
  | 'validate-structural'
  | 'retry'
  | 'done';

export interface BrandTokens {
  primary: string;       // hex
  secondary: string;     // hex
  accent: string;        // hex
  fontFamily: string;    // fallback list
}

export type Persistence = 'session' | 'ephemeral';

// LlmProvider is defined in ./llm.ts and re-exported via index.ts.
// We re-export it from this module too, so consumers can import the
// whole public surface from a single place.
export type { LlmProvider, LlmCompleteArgs, LlmCompleteResult } from './llm.js';

// TemplateManifest is defined in ./template/manifest.ts.
export type { TemplateManifest, Section, SectionKind, Slot } from './template/manifest.js';

import type { TemplateManifest } from './template/manifest.js';

export interface TemplateAssets {
  manifest: TemplateManifest;
  baseDocx: Uint8Array;
  brand: BrandTokens;
  /** Renderer override used for controlled UAT / tenant-specific compatibility. */
  renderer?: TemplateRenderer;
}

export type TemplateRenderer = 'generic' | 'legacy-scalian';

import type { LlmProvider } from './llm.js';
import type { CvData } from './cv/profile.js';

export interface TransposeInput {
  files: InputFile[];
  template: TemplateAssets;
  persistence: Persistence;
  llm: LlmProvider;
  /** Optional extraction LLM tuning. */
  extraction?: {
    /** Thinking-budget tokens for providers that support it (Claude, GPT-5, Gemini Pro). */
    reasoningBudget?: number;
    /** Enable extended thinking when the provider supports it. Default true. */
    enableReasoning?: boolean;
    /** Max retries on validation feedback. 0 disables retry. Default 1. */
    maxValidationRetries?: number;
  };
  /** Optional opt-in streaming callbacks. When undefined, transpose stays non-streaming. */
  streamCallbacks?: {
    onPhaseChange?: (file: string, phase: TransposePhase) => void;
    onThinkingDelta?: (file: string, delta: string) => void;
    onContentDelta?: (file: string, delta: string) => void;
    onParsedKeys?: (file: string, keys: string[]) => void;
  };
}

export interface DetectedFields {
  name?: string;
  titleLine1?: string;
  titleLine2?: string;
  yearsOfExperience?: number;
  experienceCount: number;
  educationCount: number;
  skillBuckets: number;
  languagesCount: number;
}

export interface AlignmentReport {
  validationPassed: boolean;
  warnings: string[];
  detectedFields: DetectedFields;
  page1SectionsFound: string[];
  /** Section labels declared in the manifest but absent from the rendered DOCX. */
  missingRequiredSections: string[];
  /** Number of validation-feedback retries performed before convergence/abandon. */
  retriesUsed: number;
}

export interface TransposedCv {
  sourceFileName: string;
  outputDocxName: string;        // computed via template.manifest.naming
  outputDocx: Uint8Array;
  /** Structured profile parsed from the LLM extraction step. */
  profile: CvData;
  /** Raw text extracted from the CV source (PDF or DOCX). */
  sourceText: string;
  /** Token usage from the provider, aggregated across retries. */
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  alignmentReport: AlignmentReport;
  errors: string[];              // empty on success; populated on fail-loud paths
}

export interface TransposeOutput {
  results: TransposedCv[];
}
