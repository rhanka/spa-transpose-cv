import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { transpose } from './transpose.js';
import { cvDataSchema } from './cv/profile.js';
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

async function readDocumentXml(docx: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(Buffer.from(docx));
  const file = zip.file('word/document.xml');
  if (!file) throw new Error('word/document.xml not found');
  return file.async('string');
}

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
  }, 60_000);

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
      // Disable the validation-retry loop for this test so that usage / parsed
      // keys callbacks reflect a single LLM call. Retry-loop behaviour has its
      // own dedicated tests below.
      extraction: { maxValidationRetries: 0 },
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

  it('returns profile, sourceText, and usage on the success path', async () => {
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
      // Disable the validation-retry loop so this test stays focused on the
      // shape of the success-path output (one LLM call, deterministic timing).
      extraction: { maxValidationRetries: 0 },
    });

    const cv = r.results[0]!;
    expect(cv.errors).toEqual([]);

    // profile is the parsed CvData (matches the fixture).
    expect(cv.profile.name).toBe(expected.name);
    expect(cv.profile.title_line1).toBe(expected.title_line1);
    expect(cv.profile.experience.length).toBe(1);

    // sourceText is the extracted raw text (not empty, large enough to be the
    // actual CV body — heuristic: > 50 chars).
    expect(typeof cv.sourceText).toBe('string');
    expect(cv.sourceText.length).toBeGreaterThan(50);

    // usage is present (stubLlm omits usage, so we expect the zero-default).
    expect(cv.usage.inputTokens).toBe(0);
    expect(cv.usage.outputTokens).toBe(0);
    expect(cv.usage.totalTokens).toBe(0);
    expect(cv.usage.totalTokens).toBeGreaterThanOrEqual(0);
  }, 30_000);

  it('accepts LLM JSON wrapped in a markdown code fence', async () => {
    const fencedLlm: LlmProvider = {
      async complete() {
        return { text: `\`\`\`json\n${JSON.stringify(expected)}\n\`\`\`` };
      },
    };

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
      llm: fencedLlm,
      extraction: { maxValidationRetries: 0 },
    });

    const cv = r.results[0]!;
    expect(cv.errors).toEqual([]);
    expect(cv.profile.name).toBe(expected.name);
  }, 30_000);

  it('can render Scalian through the legacy renderer hook', async () => {
    const r = await transpose({
      files: [
        {
          name: 'cv-001-junior-pm.pdf',
          bytes: new Uint8Array(cv001),
          mime: 'application/pdf',
        },
      ],
      template: { ...assets, renderer: 'legacy-scalian' },
      persistence: 'ephemeral',
      llm: stubLlm,
      extraction: { maxValidationRetries: 0 },
    });

    const cv = r.results[0]!;
    expect(cv.errors).toEqual([]);

    const documentXml = await readDocumentXml(cv.outputDocx);
    expect(documentXml).toContain('w:fill="E6E6E6"');
    expect(documentXml).toContain('w:color w:val="7030A0"');
    expect(documentXml).toContain('<w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr>');
  }, 30_000);

  it('on LLM returning malformed JSON, populates errors and uses fallback profile', async () => {
    const badLlm: LlmProvider = {
      async complete() {
        return {
          text: 'this is not JSON',
          usage: { inputTokens: 10, outputTokens: 5 },
        };
      },
    };

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
      llm: badLlm,
    });

    const cv = r.results[0]!;

    // Failure was captured per-input (not thrown out of transpose).
    expect(cv.errors.length).toBeGreaterThan(0);

    // profile is the type-valid empty fallback — it must still satisfy the
    // schema (no `{} as CvData` casts in the implementation).
    expect(typeof cv.profile.name).toBe('string');
    expect(cv.profile.name.length).toBeGreaterThan(0);
    expect(() => cvDataSchema.parse(cv.profile)).not.toThrow();

    // sourceText: extraction ran before the LLM, so we still get the raw text.
    expect(typeof cv.sourceText).toBe('string');
    expect(cv.sourceText.length).toBeGreaterThan(50);

    // usage propagates even when the LLM response was malformed.
    expect(cv.usage.inputTokens).toBe(10);
    expect(cv.usage.outputTokens).toBe(5);
    expect(cv.usage.totalTokens).toBe(15);

    // outputDocx may be empty on failure — just verify the shape.
    expect(cv.outputDocx).toBeInstanceOf(Uint8Array);
  }, 30_000);

  it('does not retry the LLM when maxValidationRetries is 0', async () => {
    let callCount = 0;
    const countingLlm: LlmProvider = {
      async complete() {
        callCount++;
        return {
          text: JSON.stringify(expected),
          usage: { inputTokens: 50, outputTokens: 100 },
        };
      },
    };

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
      llm: countingLlm,
      extraction: { maxValidationRetries: 0 },
    });

    const cv = r.results[0]!;
    if (cv.errors.length > 0) {
      throw new Error('transpose returned errors: ' + cv.errors.join('; '));
    }

    // maxValidationRetries=0 forces a single LLM call regardless of validation.
    expect(callCount).toBe(1);
    expect(cv.alignmentReport.retriesUsed).toBe(0);

    // Single-call usage is reported verbatim.
    expect(cv.usage.inputTokens).toBe(50);
    expect(cv.usage.outputTokens).toBe(100);
    expect(cv.usage.totalTokens).toBe(150);
  }, 30_000);

  it('retries when first attempt produces a validation finding (warnings or missing sections)', async () => {
    // The cv-001 fixture + scalian-test manifest is empirically known to
    // produce a non-empty validation report on the first render (LibreOffice
    // page-1 layout heuristic). With maxValidationRetries=1 we therefore
    // expect EXACTLY 2 LLM calls and retriesUsed=1 — proof that the retry
    // loop is wired through extract → render → validate.
    //
    // The fake LLM returns the same `expected` profile on both calls; we are
    // not testing convergence here (the second attempt fails validation just
    // like the first) — we are testing that a validation finding on attempt 1
    // triggers a second extract+render+validate cycle.
    let callCount = 0;
    const retryPhaseSeen: TransposePhase[] = [];
    const flakyLlm: LlmProvider = {
      async complete() {
        callCount++;
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
        },
      ],
      template: assets,
      persistence: 'ephemeral',
      llm: flakyLlm,
      extraction: { maxValidationRetries: 1 },
      streamCallbacks: {
        onPhaseChange: (_, phase) => {
          if (phase === 'retry') retryPhaseSeen.push(phase);
        },
      },
    });

    const cv = r.results[0]!;
    if (cv.errors.length > 0) {
      throw new Error('transpose returned errors: ' + cv.errors.join('; '));
    }

    // Retry was attempted.
    expect(callCount).toBe(2);
    expect(cv.alignmentReport.retriesUsed).toBe(1);
    expect(retryPhaseSeen).toContain('retry');

    // Usage is aggregated across all LLM calls.
    expect(cv.usage.inputTokens).toBe(200);
    expect(cv.usage.outputTokens).toBe(400);
    expect(cv.usage.totalTokens).toBe(600);
  }, 60_000);
});
