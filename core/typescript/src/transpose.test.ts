import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { transpose } from './transpose.js';
import type { LlmProvider, TemplateAssets, TemplateManifest } from './index.js';

const baseDocx = readFileSync(
  new URL('../../fixtures/templates-test/scalian/base.docx', import.meta.url),
);
const manifest = JSON.parse(
  readFileSync(
    new URL('../../fixtures/templates-test/scalian/manifest.json', import.meta.url),
    'utf8',
  ),
) as TemplateManifest;
const expected = JSON.parse(
  readFileSync(
    new URL('../../fixtures/cv-001-junior-pm.expected-extraction.json', import.meta.url),
    'utf8',
  ),
);
const cv001 = readFileSync(new URL('../../fixtures/cv-001-junior-pm.pdf', import.meta.url));

const stubLlm: LlmProvider = {
  async complete() {
    return { text: JSON.stringify(expected) };
  },
};

const assets: TemplateAssets = {
  manifest,
  baseDocx: new Uint8Array(baseDocx),
  brand: {
    primary: '#0F2137',
    secondary: '#23344A',
    accent: '#7DB7E1',
    fontFamily: 'Lato',
  },
};

describe('transpose()', () => {
  it('produces a non-empty DOCX for cv-001 with stub LLM', async () => {
    const r = await transpose({
      files: [
        {
          name: 'cv-001-junior-pm.pdf',
          bytes: new Uint8Array(cv001),
          mime: 'application/pdf',
        },
      ],
      template: assets,
      persistence: 'ephemeral',
      llm: stubLlm,
    });

    expect(r.results.length).toBe(1);
    const cv = r.results[0]!;

    if (cv.errors.length > 0) {
      throw new Error('transpose returned errors: ' + cv.errors.join('; '));
    }

    expect(cv.outputDocx.length).toBeGreaterThan(1000);
    expect(cv.errors).toEqual([]);
    expect(cv.outputDocxName).toMatch(/\.docx$/);
    expect(cv.alignmentReport.detectedFields.experienceCount).toBe(1);
    expect(cv.alignmentReport.detectedFields.skillBuckets).toBe(2);
    expect(cv.alignmentReport.detectedFields.languagesCount).toBe(2);
    expect(cv.alignmentReport.detectedFields.educationCount).toBe(1);
    expect(cv.alignmentReport.detectedFields.name).toBe('Jane Smith');
  }, 30_000);
});
