import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { transpose } from './transpose.js';
import type {
  LlmProvider,
  TemplateAssets,
  TemplateManifest,
  TransposePhase,
} from './index.js';

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

  it('forwards streaming deltas and includes userPromptOverride in the LLM call', async () => {
    let lastUserPrompt = '';
    let lastSystemPrompt = '';
    const phases: TransposePhase[] = [];
    const thinkingDeltas: string[] = [];
    const contentDeltas: string[] = [];
    const parsedKeysSeen: string[][] = [];

    const recordingLlm: LlmProvider = {
      async complete(args) {
        lastUserPrompt = args.userPrompt;
        lastSystemPrompt = args.systemPrompt;
        // Simulate a streaming response.
        args.onDelta?.({ kind: 'thinking', text: 'pondering...' });
        args.onDelta?.({ kind: 'content', text: '{"name":"X"...' });
        return {
          text: JSON.stringify(expected),
          usage: { inputTokens: 100, outputTokens: 200 },
        };
      },
    };

    const r = await transpose({
      files: [
        {
          name: 'cv-001-junior-pm.pdf',
          bytes: new Uint8Array(cv001),
          mime: 'application/pdf',
          userPromptOverride: 'TARGET: Acme',
        },
      ],
      template: assets,
      persistence: 'ephemeral',
      llm: recordingLlm,
      streamCallbacks: {
        onPhaseChange: (_, phase) => phases.push(phase),
        onThinkingDelta: (_, t) => thinkingDeltas.push(t),
        onContentDelta: (_, t) => contentDeltas.push(t),
        onParsedKeys: (_, keys) => parsedKeysSeen.push(keys),
      },
    });

    const cv = r.results[0]!;
    if (cv.errors.length > 0) {
      throw new Error('transpose returned errors: ' + cv.errors.join('; '));
    }

    // userPromptOverride is interpolated into the assembled user prompt.
    expect(lastUserPrompt).toContain('TARGET: Acme');
    // sourceFileName is also interpolated.
    expect(lastUserPrompt).toContain('cv-001-junior-pm.pdf');
    // System prompt comes from the markdown spec (non-trivial).
    expect(lastSystemPrompt.length).toBeGreaterThan(200);

    // Phase callbacks fire for the documented phases.
    expect(phases).toContain('extract-text');
    expect(phases).toContain('extract-cv-llm');
    expect(phases).toContain('render-docx');
    expect(phases).toContain('validate-page1');
    expect(phases).toContain('done');

    // Delta forwarders route by kind.
    expect(thinkingDeltas).toContain('pondering...');
    expect(contentDeltas[0]).toContain('{"name":"X"');

    // Usage propagates from the LLM response.
    expect(cv.usage.inputTokens).toBe(100);
    expect(cv.usage.outputTokens).toBe(200);
    expect(cv.usage.totalTokens).toBe(300);

    // onParsedKeys fires once with the profile keys.
    expect(parsedKeysSeen.length).toBe(1);
    expect(parsedKeysSeen[0]).toContain('name');
    expect(parsedKeysSeen[0]).toContain('experience');
  }, 30_000);
});
