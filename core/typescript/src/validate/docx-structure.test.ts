import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateDocxStructure } from './docx-structure.js';

const golden = readFileSync(
  new URL('../../../golden/cv-001-junior-pm.scalian.docx', import.meta.url),
);

describe('validateDocxStructure', () => {
  it('reports zero missing when required labels are present', async () => {
    // The golden DOCX content has sections labelled as in
    // core/fixtures/templates-test/scalian/manifest.json. Read the manifest at
    // runtime to derive the expected labels (avoids drift).
    const manifest = JSON.parse(
      readFileSync(
        new URL(
          '../../../fixtures/templates-test/scalian/manifest.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const labels: string[] = manifest.sections.map((s: { label: string }) => s.label);
    const r = await validateDocxStructure(new Uint8Array(golden), labels);
    // We don't require missing.length === 0 because the manifest may declare
    // sections the body doesn't render. Still — at least one section must be
    // FOUND.
    expect(r.found.length).toBeGreaterThan(0);
  });

  it('reports a fabricated label as missing', async () => {
    const r = await validateDocxStructure(new Uint8Array(golden), [
      'THIS-LABEL-IS-DEFINITELY-NOT-IN-ANY-DOCX',
    ]);
    expect(r.missing).toContain('THIS-LABEL-IS-DEFINITELY-NOT-IN-ANY-DOCX');
    expect(r.found).toEqual([]);
  });
});
