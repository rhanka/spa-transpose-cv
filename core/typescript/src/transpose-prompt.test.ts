import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserPrompt } from './transpose-prompt.js';

describe('transpose prompt assembly', () => {
  it('system prompt is non-empty and substantial', () => {
    const s = buildSystemPrompt();
    expect(s.length).toBeGreaterThan(200);
    // Sanity: should mention something CV-extraction-related.
    expect(s.toUpperCase()).toMatch(/CV|EXTRACT|JSON/);
  });

  it('user prompt interpolates sourceFileName and cvText', () => {
    const p = buildUserPrompt({
      cvText: 'EXAMPLE CV TEXT MARKER',
      sourceFileName: 'cv-007.pdf',
    });
    expect(p).toContain('cv-007.pdf');
    expect(p).toContain('EXAMPLE CV TEXT MARKER');
    // No leftover ${...} placeholders.
    expect(p).not.toMatch(/\$\{[a-zA-Z]+\}/);
  });

  it('user prompt injects userPromptOverride when provided', () => {
    const p = buildUserPrompt({
      cvText: 'irrelevant',
      sourceFileName: 'x.pdf',
      userPromptOverride: 'TARGET COMPANY: Acme Corp Industries',
    });
    expect(p).toContain('TARGET COMPANY: Acme Corp Industries');
    expect(p).toContain('x.pdf');
    expect(p).toContain('irrelevant');
  });
});
