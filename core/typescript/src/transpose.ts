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
import type {
  AlignmentReport,
  DetectedFields,
  TransposeInput,
  TransposeOutput,
  TransposedCv,
} from './types.js';
import type { TemplateContract } from './template/contract.js';

// The extraction prompt lives in the spec tree so that all language ports
// share the same canonical text. Read it lazily on first use so loading the
// module never touches the filesystem.
let cachedExtractPrompt: string | null = null;
async function loadExtractPrompt(): Promise<string> {
  if (cachedExtractPrompt !== null) return cachedExtractPrompt;
  const url = new URL('../../../core/spec/prompts/extract-cv.md', import.meta.url);
  cachedExtractPrompt = await readFile(url, 'utf-8');
  return cachedExtractPrompt;
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
  const extractPrompt = await loadExtractPrompt();

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

    try {
      // 1. Extract raw text from the upload
      const rawText = await extractTextFromBuffer(Buffer.from(file.bytes), file.name);

      // 2. LLM → CvData
      const llmResp = await input.llm.complete({
        systemPrompt: extractPrompt,
        userPrompt: rawText,
        maxTokens: 8192,
        temperature: 0.1,
      });

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
      const profile = cvDataResult.data;
      cvName = profile.name;

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
      outputDocx = await renderDocxFromContract({
        baseDocx: input.template.baseDocx,
        data: profile,
        contract,
      });

      // 4. Validate page 1 (LibreOffice-based; produces warnings, not errors)
      const v = await validatePage1(outputDocx, {
        experienceSectionLabel: getPrimaryExperienceSectionLabel(contract),
        sectorSectionLabel: getPrimarySectorSectionLabel(contract),
      });
      warnings = v.warnings;
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
    };

    results.push({
      sourceFileName: file.name,
      outputDocxName,
      outputDocx,
      alignmentReport,
      errors,
    });
  }

  return { results };
}
