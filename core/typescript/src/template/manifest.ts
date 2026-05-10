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
