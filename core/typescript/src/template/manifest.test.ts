import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import Ajv from 'ajv';
import schema from '../../../../core/spec/template-manifest-v1.json' assert { type: 'json' };
import { DEFAULT_RENDERING, validateTemplateManifest } from './manifest.js';

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

describe('validateTemplateManifest', () => {
  it('returns ok+manifest on valid input', () => {
    const r = validateTemplateManifest(minimal);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.manifest.tenantKey).toBe('direct:test');
  });

  it('returns ok=false with errors on invalid input', () => {
    const r = validateTemplateManifest({ broken: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe('template-manifest-v1 rendering block', () => {
  it('accepts a manifest with a populated rendering block', () => {
    const withRendering = {
      ...minimal,
      rendering: {
        headerStyle: 'compact-split',
        sectionStyle: 'compact-rule',
        jobStyle: 'compact-dense',
        colors: { accent: '#6F6B74', bodyText: '#4B4E55' },
        fonts: { heading: 'Lato', body: 'Lato' },
        spacing: { sectionBeforeTwip: 120, lineTwip: 240 },
        sectionLabelOverrides: { experience: 'EXPERIENCE' },
      },
    };
    const r = validateTemplateManifest(withRendering);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.manifest.rendering?.headerStyle).toBe('compact-split');
      expect(r.manifest.rendering?.colors?.accent).toBe('#6F6B74');
    }
  });

  it('tolerates a manifest without rendering (older tenants)', () => {
    const r = validateTemplateManifest(minimal);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.manifest.rendering).toBeUndefined();
  });

  it('rejects an unknown headerStyle value', () => {
    const bad = { ...minimal, rendering: { headerStyle: 'fancy-glow' } };
    const r = validateTemplateManifest(bad);
    expect(r.ok).toBe(false);
  });

  it('rejects a malformed color (must be #RRGGBB)', () => {
    const bad = { ...minimal, rendering: { colors: { accent: 'red' } } };
    const r = validateTemplateManifest(bad);
    expect(r.ok).toBe(false);
  });

  it('exposes a non-empty DEFAULT_RENDERING fallback', () => {
    expect(DEFAULT_RENDERING.headerStyle).toBeTruthy();
    expect(DEFAULT_RENDERING.sectionStyle).toBeTruthy();
    expect(DEFAULT_RENDERING.jobStyle).toBeTruthy();
  });
});

describe('scalian test manifest fixture', () => {
  it('validates against the v1 schema', () => {
    const fixturePath = new URL(
      '../../../../core/fixtures/templates-test/scalian/manifest.json',
      import.meta.url,
    );
    const raw = fs.readFileSync(fixturePath, 'utf8');
    const result = validateTemplateManifest(JSON.parse(raw));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.tenantKey).toBe('direct:scalian-test');
      expect(result.manifest.sections.map(s => s.label)).toEqual([
        'TECHNICAL SKILLS',
        'SECTOR-SPECIFIC SKILLS',
        'WORK EXPERIENCE',
      ]);
    }
  });
});
