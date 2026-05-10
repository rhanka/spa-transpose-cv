import { describe, it, expect } from 'vitest';
import { validatePage1 } from './page1.js';

describe('validatePage1', () => {
  it('returns a warnings array when LibreOffice cannot process the input', async () => {
    // Smoke: pass non-DOCX bytes (4-byte ZIP magic, missing DOCX structure).
    // The function must NOT throw — its catch block surfaces the LO failure
    // as a warning. This contract is part of the saturation-safe pattern:
    // failures must be reported, not propagated as unhandled rejections.
    const result = await validatePage1(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), {
      experienceSectionLabel: 'EXPERIENCE',
      sectorSectionLabel: 'COMPETENCES',
    });
    expect(Array.isArray(result.warnings)).toBe(true);
    // We expect at least one warning: either LibreOffice is missing (ENOENT)
    // or it failed to convert the bogus input.
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings[0]).toMatch(/PDF validation failed/);
  });
});
