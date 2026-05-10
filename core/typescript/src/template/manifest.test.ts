import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import schema from '../../../../core/spec/template-manifest-v1.json' assert { type: 'json' };

const minimal = {
  version: '1.0',
  tenantKey: 'direct:test',
  naming: '{name}_CV.docx',
  header: {
    nameSlot: { paragraphIndex: 0, runIndex: 0 },
    titleLine1Slot: { paragraphIndex: 1, runIndex: 0 },
    titleLine2Slot: { paragraphIndex: 1, runIndex: 1 }
  },
  sections: [
    { id: 'exp', kind: 'experiences', label: 'Experience' }
  ]
};

describe('template-manifest-v1', () => {
  it('accepts a minimal manifest', () => {
    const ajv = new Ajv();
    const validate = ajv.compile(schema);
    expect(validate(minimal)).toBe(true);
  });

  it('rejects an unknown section.kind', () => {
    const bad = { ...minimal, sections: [{ id: 'x', kind: 'unknown', label: 'X' }] };
    const ajv = new Ajv();
    const validate = ajv.compile(schema);
    expect(validate(bad)).toBe(false);
  });
});
