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
}

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
}

import type { LlmProvider } from './llm.js';

export interface TransposeInput {
  files: InputFile[];
  template: TemplateAssets;
  persistence: Persistence;
  llm: LlmProvider;
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
}

export interface TransposedCv {
  sourceFileName: string;
  outputDocxName: string;        // computed via template.manifest.naming
  outputDocx: Uint8Array;
  alignmentReport: AlignmentReport;
  errors: string[];              // empty on success; populated on fail-loud paths
}

export interface TransposeOutput {
  results: TransposedCv[];
}
