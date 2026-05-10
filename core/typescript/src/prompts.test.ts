import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('prompts', () => {
  it('extract-cv has frontmatter + content', () => {
    const raw = readFileSync(
      new URL('../../../core/spec/prompts/extract-cv.md', import.meta.url),
      'utf8'
    );
    expect(raw).toMatch(/^---/);
    expect(raw.length).toBeGreaterThan(200);
  });

  it('qa-conductor file exists with frontmatter', () => {
    const raw = readFileSync(
      new URL('../../../core/spec/prompts/qa-conductor.md', import.meta.url),
      'utf8'
    );
    expect(raw).toMatch(/^---/);
  });
});
