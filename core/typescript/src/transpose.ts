/**
 * transpose() — the keystone API of `@cv-transpose/core`.
 *
 * Given a list of input CVs and a tenant template, run the full per-CV
 * pipeline:
 *   1. Extract raw text from the upload (PDF / DOCX / DOC).
 *   2. Call the injected {@link LlmProvider} to produce a structured CvData.
 *   3. Render a DOCX using the manifest-derived template contract.
 *   4. Validate page 1 (overflow / underflow heuristics via LibreOffice).
 *
 * This function is intentionally side-effect free with respect to sessions,
 * SSE, encryption, retries, and quality reviews — those are concerns of the
 * api orchestrator (which will delegate to transpose() for the per-CV path).
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
 * Public Contract 1 entry point. See module docstring for the pipeline.
 */
export async function transpose(input: TransposeInput): Promise<TransposeOutput> {
  const contract = manifestToContract(input.template.manifest, input.template.brand);
  const streamCallbacks = input.streamCallbacks;

  const results: TransposedCv[] = [];

  for (const file of input.files) {
    const errors: string[] = [];
    let warnings: string[] = [];
    let outputDocx: Uint8Array = new Uint8Array();
    let detectedFields: DetectedFields = {
      experienceCount: 0,
      educationCount: 0,
      skillBuckets: 0,
      languagesCount: 0,
    };
    let cvName = 'Candidate';
    let sourceText = '';
    let profile: CvData | null = null;
    let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

    try {
      // 1. Extract raw text from the upload
      streamCallbacks?.onPhaseChange?.(file.name, 'extract-text');
      const rawText = await extractTextFromBuffer(Buffer.from(file.bytes), file.name);
      sourceText = rawText;

      // 2. LLM → CvData
      streamCallbacks?.onPhaseChange?.(file.name, 'extract-cv-llm');
      const llmResp = await input.llm.complete({
        systemPrompt: buildSystemPrompt(),
        userPrompt: buildUserPrompt({
          cvText: rawText,
          sourceFileName: file.name,
          userPromptOverride: file.userPromptOverride,
        }),
        maxTokens: 8192,
        temperature: 0.1,
        enableReasoning: input.extraction?.enableReasoning ?? true,
        reasoningBudget: input.extraction?.reasoningBudget,
        onDelta: streamCallbacks ? makeDeltaForwarder(file.name, streamCallbacks) : undefined,
      });
      if (llmResp.usage) {
        usage = {
          inputTokens: llmResp.usage.inputTokens,
          outputTokens: llmResp.usage.outputTokens,
          totalTokens: llmResp.usage.inputTokens + llmResp.usage.outputTokens,
        };
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
      cvName = profile.name;
      streamCallbacks?.onParsedKeys?.(file.name, Object.keys(profile));

      detectedFields = {
        name: profile.name,
        titleLine1: profile.title_line1,
        titleLine2: profile.title_line2,
        yearsOfExperience: profile.years ? Number.parseInt(profile.years, 10) || undefined : undefined,
        experienceCount: profile.experience.length,
        educationCount: profile.education.length,
        skillBuckets: profile.technicalSkills.length,
        languagesCount: profile.languages.length,
      };

      // 3. Render DOCX
      streamCallbacks?.onPhaseChange?.(file.name, 'render-docx');
      outputDocx = await renderDocxFromContract({
        baseDocx: input.template.baseDocx,
        data: profile,
        contract,
      });

      // 4. Validate page 1 (LibreOffice-based; produces warnings, not errors)
      streamCallbacks?.onPhaseChange?.(file.name, 'validate-page1');
      const v = await validatePage1(outputDocx, {
        experienceSectionLabel: getPrimaryExperienceSectionLabel(contract),
        sectorSectionLabel: getPrimarySectorSectionLabel(contract),
      });
      warnings = v.warnings;

      streamCallbacks?.onPhaseChange?.(file.name, 'done');
    } catch (err) {
      logger.error('transpose() failed for input', { file: file.name, err: (err as Error).message });
      errors.push((err as Error).message);
    }

    const outputDocxName = errors.length === 0
      ? deriveOutputNameFromTemplateContract(contract, file.name, cvName)
      : '';

    const alignmentReport: AlignmentReport = {
      validationPassed: errors.length === 0 && warnings.length === 0,
      warnings,
      detectedFields,
      page1SectionsFound: [],
      missingRequiredSections: [],
      retriesUsed: 0,
    };

    const safeProfile: CvData = profile ?? {
      name: cvName,
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

    results.push({
      sourceFileName: file.name,
      outputDocxName,
      outputDocx,
      profile: safeProfile,
      sourceText,
      usage,
      alignmentReport,
      errors,
    });
  }

  return { results };
}
