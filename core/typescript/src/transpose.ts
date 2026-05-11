/**
 * transpose() — the keystone API of `@cv-transpose/core`.
 *
 * Given a list of input CVs and a tenant template, run the full per-CV
 * pipeline:
 *   1. Extract raw text from the upload (PDF / DOCX / DOC).
 *   2. Call the injected {@link LlmProvider} to produce a structured CvData.
 *   3. Render a DOCX using the manifest-derived template contract.
 *   4. Validate page 1 (overflow / underflow heuristics via LibreOffice).
 *   5. On validation feedback, optionally retry the extract+render+validate
 *      loop with an amended user prompt (configurable via
 *      `input.extraction.maxValidationRetries`, default 1).
 *
 * This function is intentionally side-effect free with respect to sessions,
 * SSE, encryption, and quality reviews — those are concerns of the api
 * orchestrator (which will delegate to transpose() for the per-CV path).
 *
 * Errors are captured per-input: a failure on one CV does not abort the
 * batch. Each {@link TransposedCv} carries its own `errors` array (populated
 * on fail-loud paths) and a `warnings` array via `alignmentReport`.
 */

import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { extractTextFromBuffer } from './extract/text.js';
import { validatePage1 } from './validate/page1.js';
import { validateDocxStructure } from './validate/docx-structure.js';
import {
  buildTemplateDocumentXml,
  getXmlHeader,
  writeTemplateHeader,
} from './template/render.js';
import { unpackDocx, packDocx } from './docx/tools.js';
import { manifestToContract } from './template/bridge.js';
import {
  deriveOutputNameFromTemplateContract,
  getPrimaryExperienceSectionLabel,
  getPrimarySectorSectionLabel,
} from './template/contract.js';
import { cvDataSchema, type CvData } from './cv/profile.js';
import { defaultLogger as logger } from './util/log.js';
import { buildSystemPrompt, buildUserPrompt } from './transpose-prompt.js';
import type { LlmCompleteArgs } from './llm.js';
import type {
  AlignmentReport,
  DetectedFields,
  InputFile,
  TemplateManifest,
  TransposeInput,
  TransposeOutput,
  TransposedCv,
} from './types.js';
import type { TemplateContract } from './template/contract.js';

/**
 * Build a streaming-delta forwarder that routes the provider's deltas to the
 * file-scoped streamCallbacks. Created per file so the file name is captured
 * in the closure.
 */
function makeDeltaForwarder(
  fileName: string,
  cb: NonNullable<TransposeInput['streamCallbacks']>,
): NonNullable<LlmCompleteArgs['onDelta']> {
  return (delta) => {
    if (delta.kind === 'thinking') {
      cb.onThinkingDelta?.(fileName, delta.text);
    } else {
      cb.onContentDelta?.(fileName, delta.text);
    }
  };
}

/**
 * Escape XML special characters and a handful of common diacritics that the
 * downstream renderer otherwise emits as raw bytes (which LibreOffice and
 * Word render correctly, but some downstream tools choke on). Mirrors the
 * api orchestrator's `escapeXml` to keep parity until the renderer learns to
 * escape its own inputs.
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/–/g, '&#x2013;') // en-dash
    .replace(/‘/g, '&#x2018;')
    .replace(/’/g, '&#x2019;')
    .replace(/“/g, '&#x201C;')
    .replace(/”/g, '&#x201D;');
}

/**
 * Run a callback inside a fresh mkdtemp dir and clean up on the way out,
 * mirroring the saturation-safe pattern used by `extractTextFromBuffer` and
 * `validatePage1`.
 */
async function withTempDir<T>(prefix: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Type-valid empty {@link CvData} placeholder used on the failure path so a
 * `TransposedCv` always carries a `profile` of the right shape (no
 * `{} as CvData` casts).
 *
 * The schema enforces `name.min(1)`, so we use a sentinel string rather than
 * `''`. All array fields are empty, and free-form strings default to `''`.
 * `cvDataSchema.parse(EMPTY_PROFILE_FALLBACK)` must succeed — this is locked
 * by the transpose failure-path test.
 */
const EMPTY_PROFILE_FALLBACK: CvData = {
  name: 'Candidate',
  title_line1: '',
  title_line2: '',
  years: '',
  technicalSkills: [],
  sectors: [],
  domains: [],
  experience: [],
  languages: [],
  education: [],
  attention_cv: '',
};

function escapeCvData(data: CvData): CvData {
  return {
    ...data,
    name: escapeXml(data.name),
    title_line1: escapeXml(data.title_line1),
    title_line2: escapeXml(data.title_line2),
    technicalSkills: data.technicalSkills.map((skill) => ({
      label: escapeXml(skill.label),
      description: escapeXml(skill.description),
    })),
    sectors: data.sectors.map((sector) => escapeXml(sector)),
    domains: data.domains.map((domain) => escapeXml(domain)),
    experience: data.experience.map((job) => ({
      ...job,
      company: escapeXml(job.company),
      description: escapeXml(job.description),
      dates: escapeXml(job.dates),
      title: escapeXml(job.title),
      tasks: job.tasks.map((task) => escapeXml(task)),
      achievements: job.achievements.map((achievement) => escapeXml(achievement)),
      techEnvironment: escapeXml(job.techEnvironment),
    })),
    languages: data.languages.map((language) => ({
      label: escapeXml(language.label),
      level: escapeXml(language.level),
    })),
    education: data.education.map((entry) => ({
      year: escapeXml(entry.year),
      description: escapeXml(entry.description),
    })),
  };
}

async function renderDocxFromContract(params: {
  baseDocx: Uint8Array;
  data: CvData;
  contract: TemplateContract;
}): Promise<Uint8Array> {
  return withTempDir('cv-transpose-render-', async (workDir) => {
    // unpackDocx / packDocx are filesystem-based today (Python parity), so
    // we materialise the base.docx to a temp file, unpack into a sibling
    // dir, and pack to another temp file. This mirrors what the api
    // orchestrator does today.
    const baseDocxPath = join(workDir, 'base.docx');
    await writeFile(baseDocxPath, Buffer.from(params.baseDocx));

    const unpackDir = join(workDir, 'unpacked');
    const [unpackOk, unpackMsg] = await unpackDocx(baseDocxPath, unpackDir);
    if (!unpackOk) {
      throw new Error(`unpackDocx failed: ${unpackMsg}`);
    }

    const documentXmlPath = join(unpackDir, 'word', 'document.xml');
    const xmlHeader = await getXmlHeader(documentXmlPath);
    const escaped = escapeCvData(params.data);
    const documentXml = buildTemplateDocumentXml(escaped, params.contract, xmlHeader);
    await writeFile(documentXmlPath, documentXml, 'utf-8');

    // Some DOCX templates (Word 2016+) put the title block in header2.xml;
    // older ones use header1.xml. Try both, but only the present file
    // matters — `writeTemplateHeader` reads then writes the XML so the file
    // must exist. We swallow ENOENT for the missing variant.
    for (const headerName of ['header2.xml', 'header1.xml']) {
      const headerPath = join(unpackDir, 'word', headerName);
      try {
        await writeTemplateHeader(headerPath, {
          name: escaped.name,
          title_line1: escaped.title_line1,
          title_line2: escaped.title_line2,
          years: escaped.years,
        }, params.contract);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw err;
        }
      }
    }

    const outDocxPath = join(workDir, 'out.docx');
    const [packOk, packMsg] = await packDocx(unpackDir, outDocxPath, baseDocxPath);
    if (!packOk) {
      throw new Error(`packDocx failed: ${packMsg}`);
    }

    const buf = await readFile(outDocxPath);
    return new Uint8Array(buf);
  });
}

/**
 * Build a zero-valued {@link AlignmentReport}. Used as the seed on the
 * failure path (so callers always get a well-typed report) and inside
 * {@link processSingleCv} before validation has run.
 */
function makeEmptyAlignmentReport(): AlignmentReport {
  return {
    validationPassed: false,
    warnings: [],
    detectedFields: {
      experienceCount: 0,
      educationCount: 0,
      skillBuckets: 0,
      languagesCount: 0,
    },
    page1SectionsFound: [],
    missingRequiredSections: [],
    retriesUsed: 0,
  };
}

/**
 * Combined per-render validation: page-1 overflow/underflow (via LibreOffice)
 * plus structural presence of required section labels (text-based, in-memory).
 *
 * Task 6 introduces this helper as the single validation entry point that the
 * retry loop drives off of. Task 7 will tighten the structural rules and make
 * `validationPassed` strictly mirror the union (warnings ∪ missingRequiredSections).
 */
async function runValidation(
  docxBytes: Uint8Array,
  contract: TemplateContract,
  _manifest: TemplateManifest,
  profile: CvData,
): Promise<AlignmentReport> {
  const experienceLabel = getPrimaryExperienceSectionLabel(contract);
  const sectorLabel = getPrimarySectorSectionLabel(contract);
  const requiredLabels = contract.sections
    .filter((section) => section.required)
    .map((section) => section.label);

  const page1 = await validatePage1(docxBytes, {
    experienceSectionLabel: experienceLabel,
    sectorSectionLabel: sectorLabel,
  });
  const structure = await validateDocxStructure(docxBytes, requiredLabels);

  const detectedFields: DetectedFields = {
    name: profile.name,
    titleLine1: profile.title_line1,
    titleLine2: profile.title_line2,
    yearsOfExperience: profile.years
      ? Number.parseInt(profile.years, 10) || undefined
      : undefined,
    experienceCount: profile.experience.length,
    educationCount: profile.education.length,
    skillBuckets: profile.technicalSkills.length,
    languagesCount: profile.languages.length,
  };

  return {
    validationPassed: page1.warnings.length === 0 && structure.missing.length === 0,
    warnings: page1.warnings,
    detectedFields,
    page1SectionsFound: structure.found,
    missingRequiredSections: structure.missing,
    retriesUsed: 0, // caller overwrites with the actual count after the loop
  };
}

/**
 * Per-CV pipeline: extract → (LLM → render → validate)* → result.
 *
 * The middle phase runs in a retry loop bounded by
 * `input.extraction?.maxValidationRetries ?? 1`. When validation produces
 * warnings or missing required sections, the user prompt is amended with a
 * feedback paragraph and the LLM is re-invoked. Usage tokens are aggregated
 * across attempts; only the most recent render's bytes and alignment report
 * are returned.
 *
 * Errors are captured into the returned `TransposedCv.errors` (fail-soft),
 * matching the batch-tolerant contract of {@link transpose}.
 */
async function processSingleCv(
  file: InputFile,
  input: TransposeInput,
  contract: TemplateContract,
  manifest: TemplateManifest,
): Promise<TransposedCv> {
  const streamCallbacks = input.streamCallbacks;
  const errors: string[] = [];

  let outputDocx: Uint8Array = new Uint8Array();
  let profile: CvData | null = null;
  let sourceText = '';
  let usageTotal = { inputTokens: 0, outputTokens: 0 };
  let alignmentReport: AlignmentReport = makeEmptyAlignmentReport();
  let userPromptOverride = file.userPromptOverride;
  let retriesUsed = 0;

  const maxRetries = input.extraction?.maxValidationRetries ?? 1;

  try {
    // 1. Extract raw text from the upload (once, reused across retries).
    streamCallbacks?.onPhaseChange?.(file.name, 'extract-text');
    sourceText = await extractTextFromBuffer(Buffer.from(file.bytes), file.name);

    // 2. Extract → render → validate, up to maxRetries+1 times.
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        streamCallbacks?.onPhaseChange?.(file.name, 'retry');
      }

      // 2a. LLM → CvData
      streamCallbacks?.onPhaseChange?.(file.name, 'extract-cv-llm');
      const llmResp = await input.llm.complete({
        systemPrompt: buildSystemPrompt(),
        userPrompt: buildUserPrompt({
          cvText: sourceText,
          sourceFileName: file.name,
          userPromptOverride,
        }),
        maxTokens: 8192,
        temperature: 0.1,
        enableReasoning: input.extraction?.enableReasoning ?? true,
        reasoningBudget: input.extraction?.reasoningBudget,
        onDelta: streamCallbacks ? makeDeltaForwarder(file.name, streamCallbacks) : undefined,
      });
      if (llmResp.usage) {
        usageTotal.inputTokens += llmResp.usage.inputTokens;
        usageTotal.outputTokens += llmResp.usage.outputTokens;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(llmResp.text);
      } catch (err) {
        throw new Error(`LLM did not return valid JSON: ${(err as Error).message}`);
      }

      const cvDataResult = cvDataSchema.safeParse(parsed);
      if (!cvDataResult.success) {
        throw new Error(
          `LLM output failed schema validation: ${cvDataResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
        );
      }
      profile = cvDataResult.data;
      streamCallbacks?.onParsedKeys?.(file.name, Object.keys(profile));

      // 2b. Render DOCX
      streamCallbacks?.onPhaseChange?.(file.name, 'render-docx');
      outputDocx = await renderDocxFromContract({
        baseDocx: input.template.baseDocx,
        data: profile,
        contract,
      });

      // 2c. Validate (page1 overflow/underflow + required-section presence)
      streamCallbacks?.onPhaseChange?.(file.name, 'validate-page1');
      alignmentReport = await runValidation(outputDocx, contract, manifest, profile);

      const cleanRun =
        alignmentReport.warnings.length === 0 &&
        alignmentReport.missingRequiredSections.length === 0;
      if (cleanRun) {
        break; // success — no retry needed
      }
      if (attempt >= maxRetries) {
        break; // out of retries
      }

      // 2d. Amend the user prompt with validation feedback for the next attempt.
      retriesUsed++;
      const feedbackParts = [
        ...alignmentReport.warnings,
        ...alignmentReport.missingRequiredSections.map((s) => `Missing required section "${s}"`),
      ];
      userPromptOverride = [
        file.userPromptOverride ?? '',
        `VALIDATION ERRORS: ${feedbackParts.join('; ')}.`,
        'Shorten all skill descriptions to max 100 characters. Reduce sectors to max 4. Reduce domains to max 4.',
      ]
        .filter((s) => s.length > 0)
        .join('\n\n');
    }

    alignmentReport.retriesUsed = retriesUsed;
    streamCallbacks?.onPhaseChange?.(file.name, 'done');
  } catch (err) {
    logger.error('transpose() failed for input', { file: file.name, err: (err as Error).message });
    errors.push((err as Error).message);
    alignmentReport.retriesUsed = retriesUsed;
  }

  // Failure-path fallback: use the type-valid empty constant (so the result
  // always satisfies `cvDataSchema`). On the success path, `profile` is the
  // parsed CvData from the most recent attempt.
  const safeProfile: CvData = profile ?? EMPTY_PROFILE_FALLBACK;
  const cvName = profile?.name ?? 'Candidate';

  const outputDocxName = errors.length === 0
    ? deriveOutputNameFromTemplateContract(contract, file.name, cvName)
    : '';

  return {
    sourceFileName: file.name,
    outputDocxName,
    outputDocx,
    profile: safeProfile,
    sourceText,
    usage: {
      inputTokens: usageTotal.inputTokens,
      outputTokens: usageTotal.outputTokens,
      totalTokens: usageTotal.inputTokens + usageTotal.outputTokens,
    },
    alignmentReport,
    errors,
  };
}

/**
 * Public Contract 1 entry point. See module docstring for the pipeline.
 */
export async function transpose(input: TransposeInput): Promise<TransposeOutput> {
  const contract = manifestToContract(input.template.manifest, input.template.brand);

  const results: TransposedCv[] = [];
  for (const file of input.files) {
    results.push(await processSingleCv(file, input, contract, input.template.manifest));
  }
  return { results };
}
