import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

describe('workflow.yaml', () => {
  it('parses and lists 5 steps', () => {
    const raw = readFileSync(new URL('../../../core/spec/workflow.yaml', import.meta.url), 'utf8');
    const w = parse(raw);
    expect(w.version).toBe(1);
    expect(w.steps.length).toBe(5);
    expect(w.steps.map((s: any) => s.id)).toEqual([
      'extract-text', 'extract-cv', 'render-docx', 'validate-page1', 'qa-conductor'
    ]);
  });
});
