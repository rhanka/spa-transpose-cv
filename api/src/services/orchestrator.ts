import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { validatePage1 } from '@cv-transpose/core';
import { getMeta, writeMeta, updateStatus, updateFileStatus, getSessionKey, type SessionMeta } from './session-manager.js';
import { decrypt, encrypt } from './crypto.js';
import { extractTextFromBuffer } from './text-extractor.js';
import { extractCvDataWithRetry, type CvData, type StreamCallbacks, type TokenUsage } from './cv-agent.js';
import { getActiveProvider, getProviderConfig } from './llm/index.js';
import { validateDocxBuffer } from './docx-reader.js';
import { DEFAULT_TENANT_SLUG, getTenantConfig, getTenantTemplatePath, type TenantConfig } from './tenant-config.js';
import {
  deriveOutputNameFromTemplateContract,
  getPrimaryExperienceSectionLabel,
  getPrimarySectorSectionLabel,
  getRequiredSectionLabels,
  validateCvDataAgainstTemplateContract,
} from './template-contract.js';
import { buildTemplateDocumentXml, getXmlHeader, writeTemplateHeader } from './template-xml.js';
import { unpackDocx, packDocx } from './docx-tools.js';
import { defaultLatoSource, embedLatoFonts } from './font-embedding.js';

// SSE emitter type — set by the route handler
export type SseEmitter = (fileIndex: number, event: SseEvent) => void;

export interface SseEvent {
  phase: 'extracting_text' | 'calling_claude' | 'building_docx' | 'validating' | 'done' | 'error';
  thinking_delta?: string;
  content_delta?: string;
  parsed_keys?: Record<string, unknown>;
  elapsed_ms?: number;
  error?: string;
  attention_cv?: string;
  attention_trad?: string;
  tokenInfo?: string;
}

function buildEffectivePrompt(meta: Pick<SessionMeta, 'prompt' | 'targetCompany'>): string {
  const promptParts = [meta.prompt.trim()];
  if (meta.targetCompany) {
    promptParts.push(
      `TARGET COMPANY CONTEXT: tailor the emphasis for ${meta.targetCompany} without inventing facts and without altering dates, employers, certifications, or responsibilities.`,
    );
  }
  return promptParts.filter(Boolean).join('\n\n');
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/–/g, '&#x2013;')
    .replace(/'/g, '&#x2019;')
    .replace(/'/g, '&#x2019;')
    .replace(/é/g, '&#xE9;')
    .replace(/É/g, '&#xC9;')
    .replace(/è/g, '&#xE8;')
    .replace(/ê/g, '&#xEA;')
    .replace(/à/g, '&#xE0;')
    .replace(/ç/g, '&#xE7;')
    .replace(/ô/g, '&#xF4;')
    .replace(/œ/g, '&#x0153;');
}

async function processOneCV(
  sessionId: string,
  fileIndex: number,
  sessionKey: Buffer,
  userPrompt: string,
  originalName: string,
  encryptedName: string,
  emitSse?: SseEmitter,
  providerId?: string,
  tenantConfig?: TenantConfig,
): Promise<{ cvData: CvData; outputName: string; sourceText: string; usage: TokenUsage } | null> {
  const sessionDir = join(env.DATA_DIR, sessionId);
  const startTime = Date.now();

  await updateFileStatus(sessionId, fileIndex, 'processing');

  try {
    // 1. Extract text
    emitSse?.(fileIndex, { phase: 'extracting_text', elapsed_ms: Date.now() - startTime });
    const encryptedData = await readFile(join(sessionDir, 'inputs', encryptedName));
    const rawData = decrypt(encryptedData, sessionKey);
    const text = await extractTextFromBuffer(rawData, originalName);
    logger.info({ sessionId, file: originalName, textLength: text.length }, 'Text extracted');

    // 2. Call Claude with streaming
    emitSse?.(fileIndex, { phase: 'calling_claude', elapsed_ms: Date.now() - startTime });

    const streamCallbacks: StreamCallbacks = {
      onThinking: (delta) => emitSse?.(fileIndex, { phase: 'calling_claude', thinking_delta: delta, elapsed_ms: Date.now() - startTime }),
      onContent: (delta) => {
        // Optimistic parsing of keys as they stream in
        const parsed: Record<string, unknown> = {};
        const nameMatch = delta.match(/"name"\s*:\s*"([^"]+)"/);
        if (nameMatch) parsed.name = nameMatch[1];
        const titleMatch = delta.match(/"title"\s*:\s*"([^"]+)"/);
        if (titleMatch) parsed.current_position = titleMatch[1];
        if (Object.keys(parsed).length > 0) {
          emitSse?.(fileIndex, { phase: 'calling_claude', content_delta: delta, parsed_keys: parsed, elapsed_ms: Date.now() - startTime });
        }
      },
    };

    const { data: cvData, usage: agentUsage } = await extractCvDataWithRetry(text, userPrompt, originalName, streamCallbacks, providerId);
    logger.info({ sessionId, file: originalName, name: cvData.name, tokens: agentUsage }, 'CV data extracted');

    // 3. Build DOCX
    emitSse?.(fileIndex, { phase: 'building_docx', elapsed_ms: Date.now() - startTime });
    const activeTenantConfig = tenantConfig ?? await getTenantConfig({
      explicitSlug: DEFAULT_TENANT_SLUG,
    });
    const templateDocxPath = await getTenantTemplatePath(activeTenantConfig);
    const outputName = deriveOutputNameFromTemplateContract(activeTenantConfig.templateContract, originalName, cvData.name);
    await buildTemplateDocx(cvData, activeTenantConfig, sessionDir, fileIndex, templateDocxPath);

    // 4. Validate DOCX (agent auto-relecture)
    emitSse?.(fileIndex, { phase: 'validating', elapsed_ms: Date.now() - startTime });
    const outputPath = join(sessionDir, 'tmp', `output_${fileIndex}.docx`);
    const outputData = await readFile(outputPath);
    const headerErrors = validateCvDataAgainstTemplateContract(cvData, activeTenantConfig.templateContract);
    const validation = await validateDocxBuffer(
      outputData,
      getRequiredSectionLabels(activeTenantConfig.templateContract),
    );

    // 4b. PDF validation: check page 1 doesn't overflow
    const { warnings: pdfErrors } = await validatePage1(new Uint8Array(outputData), {
      experienceSectionLabel: getPrimaryExperienceSectionLabel(activeTenantConfig.templateContract),
      sectorSectionLabel: getPrimarySectorSectionLabel(activeTenantConfig.templateContract),
    });
    const allErrors = [...headerErrors, ...validation.errors, ...pdfErrors];

    if (allErrors.length > 0) {
      logger.warn({ sessionId, file: originalName, errors: allErrors }, 'DOCX validation failed');
      emitSse?.(fileIndex, { phase: 'validating', thinking_delta: `Validation errors: ${allErrors.join(', ')}. Retrying with shorter descriptions...`, elapsed_ms: Date.now() - startTime });
      const { data: retryData, usage: retryUsage } = await extractCvDataWithRetry(
        text,
        `${userPrompt}\n\nVALIDATION ERRORS: ${allErrors.join('; ')}. IMPORTANT: shorten all skill descriptions to max 100 characters. Reduce sectors to max 4, domains to max 4.`,
        originalName,
        streamCallbacks,
        providerId,
      );
      agentUsage.input_tokens += retryUsage.input_tokens;
      agentUsage.output_tokens += retryUsage.output_tokens;
      await buildTemplateDocx(retryData, activeTenantConfig, sessionDir, fileIndex, templateDocxPath);
    }

    // 5. Encrypt output
    const finalDocx = await readFile(outputPath);
    const encryptedOutput = encrypt(finalDocx, sessionKey);
    await writeFile(join(sessionDir, 'outputs', `${outputName}.enc`), encryptedOutput);

    // 6. Update meta
    await updateFileStatus(sessionId, fileIndex, 'done', { outputName });
    emitSse?.(fileIndex, {
      phase: 'done',
      elapsed_ms: Date.now() - startTime,
      attention_cv: cvData.attention_cv,
    });

    logger.info({ sessionId, file: originalName, output: outputName, ms: Date.now() - startTime, tokens: agentUsage }, 'CV processed');
    return { cvData, outputName, sourceText: text, usage: agentUsage };

  } catch (err) {
    logger.error({ sessionId, file: originalName, err }, 'CV processing failed');
    await updateFileStatus(sessionId, fileIndex, 'error', { error: (err as Error).message });
    emitSse?.(fileIndex, { phase: 'error', error: (err as Error).message, elapsed_ms: Date.now() - startTime });
    return null;
  }
}

async function buildTemplateDocx(
  data: CvData,
  tenantConfig: TenantConfig,
  sessionDir: string,
  fileIndex: number,
  templateDocxPath: string,
): Promise<void> {
  const workDir = join(sessionDir, 'tmp', `work_${fileIndex}`);
  await unpackDocx(templateDocxPath, workDir);

  // Assemble document.xml
  const xmlHeader = await getXmlHeader(join(workDir, 'word', 'document.xml'));
  const doc = buildTemplateDocumentXml({
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
  }, tenantConfig.templateContract, xmlHeader);
  await writeFile(join(workDir, 'word', 'document.xml'), doc);

  await writeTemplateHeader(join(workDir, 'word', 'header2.xml'), {
    name: escapeXml(data.name),
    title_line1: escapeXml(data.title_line1),
    title_line2: escapeXml(data.title_line2),
    years: data.years,
  }, tenantConfig.templateContract);

  // Pack
  const outputPath = join(sessionDir, 'tmp', `output_${fileIndex}.docx`);
  await packDocx(workDir, outputPath, templateDocxPath);

  // Embed the Lato font family so the downloaded DOCX looks identical in MS
  // Word on a machine where Lato is not installed. packDocx strips any stale
  // fonts from the base template, so we always start from a clean slate here.
  try {
    await embedLatoFonts(outputPath, defaultLatoSource(process.cwd()));
  } catch (err) {
    logger.warn({ err }, 'Lato font embedding skipped');
  }
}

/**
 * Conductor: validate a generated DOCX and produce attention_trad via Claude QA call
 */
async function conductorValidate(
  sessionId: string,
  fileIndex: number,
  sessionKey: Buffer,
  tenantConfig: TenantConfig,
  originalName: string,
  outputName: string,
  sourceText: string,
  emitSse?: SseEmitter,
  extraInstruction?: string,
  providerId?: string,
): Promise<{ text: string; usage: TokenUsage }> {
  const sessionDir = join(env.DATA_DIR, sessionId);
  const encOutputPath = join(sessionDir, 'outputs', `${outputName}.enc`);

  try {
    const encData = await readFile(encOutputPath);
    const docxData = decrypt(encData, sessionKey);
    const { extractTextFromDocxBuffer } = await import('./docx-reader.js');
    const outputText = await extractTextFromDocxBuffer(docxData);

    // Structural validation
    const validation = await validateDocxBuffer(
      docxData,
      getRequiredSectionLabels(tenantConfig.templateContract),
    );
    const structErrors = validation.valid ? [] : validation.errors;

    // QA analyst call for translation quality (uses active LLM provider)
    emitSse?.(fileIndex, { phase: 'validating', thinking_delta: 'Conductor: analyse qualité traduction...', elapsed_ms: 0 });

    const qaSystemPrompt = `You are a QA analyst checking the transposition quality of a CV into the target consulting template.

Do NOT comment on the CV content (career, skills, relevance).
ONLY check fidelity and conformity of the transposition.

Start directly with bullet points. NO title, NO introduction.

Check:
- Company names, certifications: reproduced exactly, not altered
- Dates: taken as-is, no estimates added
- Number of positions: consistent with source
- Achievements: from source only, no fabrication
- Skill descriptions: descriptive format, not tool lists
- Experience durations (>Ny): plausible vs career dates

IMPORTANT: Skill bullet descriptions are THEMATIC SYNTHESES of the entire career. They intentionally combine and rephrase tech from multiple roles. A specific tool appearing in a skill synthesis but not verbatim in a single role is NOT an error — it may come from another role or be a reasonable grouping. Only flag a technology as fabricated if it appears NOWHERE in the entire source CV.

If you find a clear factual error (tech truly absent from entire source, wrong date, missing role), mark it **error to fix**.

Acceptable restructuring (combining roles, inferring achievements from task descriptions, synthesizing skills) → do NOT mention.

If no significant issue: — RAS

Each bullet: 1 short sentence, max 10 words. Markdown.`;
    const qaUserPrompt = `${extraInstruction ? extraInstruction + '\n\n' : ''}SOURCE FILE: ${originalName}\n\nSOURCE TEXT:\n${sourceText}\n\n---\n\nGENERATED OUTPUT TEXT:\n${outputText}${structErrors.length > 0 ? `\n\nSTRUCTURAL VALIDATION ERRORS: ${structErrors.join('; ')}` : ''}`;

    const provider = await getActiveProvider(providerId);
    const qaResult = await provider.generate({
      system: qaSystemPrompt,
      userMessage: qaUserPrompt,
      maxTokens: 1024,
      enableReasoning: false,
    });

    return { text: qaResult.text.trim() || '—', usage: qaResult.usage };
  } catch (err) {
    logger.error({ sessionId, file: originalName, err }, 'Conductor validation error');
    return { text: `Validation error: ${(err as Error).message}`, usage: { input_tokens: 0, output_tokens: 0 } };
  }
}

export async function runOrchestrator(sessionId: string, emitSse?: SseEmitter): Promise<void> {
  logger.info({ sessionId }, 'Orchestrator started');

  const meta = await getMeta(sessionId);
  if (!meta) throw new Error(`Session ${sessionId} not found`);

  const sessionKey = getSessionKey(sessionId);
  if (!sessionKey) throw new Error(`No key in cache for session ${sessionId}`);

  const tenantConfig = await getTenantConfig({ explicitSlug: meta.tenant });
  const effectivePrompt = buildEffectivePrompt(meta);

  const concurrency = env.MAX_CONCURRENT_AGENTS;
  let running = 0;
  const queue: (() => void)[] = [];
  function acquire(): Promise<void> {
    if (running < concurrency) { running++; return Promise.resolve(); }
    return new Promise<void>(resolve => queue.push(resolve));
  }
  function release(): void {
    running--;
    const next = queue.shift();
    if (next) { running++; next(); }
  }

  const sessionProvider = meta.provider;
  logger.info({
    sessionId,
    tenant: tenantConfig.slug,
    fileCount: meta.files.length,
    concurrency,
    provider: sessionProvider || env.LLM_PROVIDER,
  }, 'Launching parallel CV processing');

  // Results for batch summary
  const results: { originalName: string; outputName: string; attention_cv: string; attention_trad: string; tokenInfo?: string }[] = [];

  const tasks = meta.files.map(async (_, idx) => {
    await acquire();
    try {
      const f = meta.files[idx];
      logger.info({ sessionId, fileIndex: idx, file: f.originalName }, 'Processing CV');
      let result = await processOneCV(
        sessionId,
        idx,
        sessionKey,
        effectivePrompt,
        f.originalName,
        f.encryptedName,
        emitSse,
        sessionProvider,
        tenantConfig,
      );

      if (result) {
        // Conductor validation
        let totalUsage = { ...result.usage };
        let qaResult = await conductorValidate(
          sessionId,
          idx,
          sessionKey,
          tenantConfig,
          f.originalName,
          result.outputName,
          result.sourceText,
          emitSse,
          undefined,
          sessionProvider,
        );
        totalUsage.input_tokens += qaResult.usage.input_tokens;
        totalUsage.output_tokens += qaResult.usage.output_tokens;
        let attention_trad = qaResult.text;

        // If conductor found errors to fix, rerun agent once
        if (attention_trad.toLowerCase().includes('error to fix')) {
          logger.info({ sessionId, file: f.originalName, feedback: attention_trad }, 'Conductor found errors, relaunching agent');
          emitSse?.(idx, { phase: 'validating', thinking_delta: `Conductor: errors detected, retrying...` });
          const retryResult = await processOneCV(sessionId, idx, sessionKey,
            `${effectivePrompt}\n\nCONDUCTOR QA FEEDBACK — fix these errors:\n${attention_trad}`,
            f.originalName, f.encryptedName, emitSse, sessionProvider, tenantConfig);
          if (retryResult) {
            totalUsage.input_tokens += retryResult.usage.input_tokens;
            totalUsage.output_tokens += retryResult.usage.output_tokens;
            const qa2 = await conductorValidate(
              sessionId, idx, sessionKey, tenantConfig, f.originalName, retryResult.outputName, retryResult.sourceText, emitSse,
              `This is a SECOND review after a fix attempt. Your previous review may have had false positives (e.g., a tech appearing in skill syntheses sourced from another role). Be MORE LENIENT: only flag issues you are CERTAIN about. If fixed, return "— RAS".`,
              sessionProvider,
            );
            totalUsage.input_tokens += qa2.usage.input_tokens;
            totalUsage.output_tokens += qa2.usage.output_tokens;
            attention_trad = qa2.text;
            result = retryResult;
          }
        }

        // FinOps: compute cost + CO2 (dynamic per provider)
        const providerCfg = await getProviderConfig(sessionProvider);
        const costUsd = (totalUsage.input_tokens * providerCfg.costPer1MInput + totalUsage.output_tokens * providerCfg.costPer1MOutput) / 1_000_000;
        const co2Grams = totalUsage.output_tokens * providerCfg.co2ePer1kOutput / 1000;
        const ledMinutes = (co2Grams / 0.5) * 60; // 0.5 gCO2/h for a 10W LED on FR grid
        const co2Str = co2Grams < 1 ? `${(co2Grams * 1000).toFixed(0)}mgCO2` : `${co2Grams.toFixed(1)}gCO2`;
        const ledStr = ledMinutes < 60 ? `${Math.round(ledMinutes)}min` : `${(ledMinutes / 60).toFixed(1)}h`;
        const tokenInfo = `${providerCfg.label} — ${(totalUsage.input_tokens / 1000).toFixed(1)}k/${(totalUsage.output_tokens / 1000).toFixed(1)}k tokens — $${costUsd.toFixed(3)} — ${co2Str} (~${ledStr} LED)`;

        const normalizeMd = (s: string) => s.replace(/ - \*\*/g, '\n- **').replace(/ - /g, '\n- ');
        const normalizedCv = normalizeMd(result.cvData.attention_cv || '—');
        attention_trad = normalizeMd(attention_trad);

        emitSse?.(idx, { phase: 'done', attention_trad, attention_cv: normalizedCv, tokenInfo });
        results.push({
          originalName: f.originalName,
          outputName: result.outputName,
          attention_cv: normalizedCv,
          attention_trad,
          tokenInfo,
        });
      } else {
        results.push({
          originalName: f.originalName,
          outputName: '—',
          attention_cv: 'Processing failed',
          attention_trad: '—',
        });
      }
    } catch (err) {
      logger.error({ sessionId, fileIndex: idx, err: (err as Error).message }, 'CV task failed');
      await updateFileStatus(sessionId, idx, 'error', { error: (err as Error).message });
    } finally {
      release();
    }
  });

  await Promise.allSettled(tasks);

  // Final status + batch summary
  const finalMeta = await getMeta(sessionId);
  if (finalMeta) {
    const allDone = finalMeta.files.every(f => f.status === 'done' || f.status === 'error');
    const hasErrors = finalMeta.files.some(f => f.status === 'error');
    finalMeta.status = allDone ? (hasErrors ? 'error' : 'done') : 'error';

    await generateBatchSummary(finalMeta, sessionKey, results);
    await writeMeta(finalMeta);
  }

  logger.info({ sessionId, fileCount: meta.files.length }, 'Orchestrator completed');
}

async function generateBatchSummary(
  meta: SessionMeta,
  sessionKey: Buffer,
  results: { originalName: string; outputName: string; attention_cv: string; attention_trad: string; tokenInfo?: string }[],
): Promise<void> {
  const sessionDir = join(env.DATA_DIR, meta.id);

  // Generate summary as markdown
  const doneCount = meta.files.filter(f => f.status === 'done').length;
  const errorCount = meta.files.filter(f => f.status === 'error').length;

  const md = [
    '# Scalian CV Batch Summary\n',
    '| Entrée | Sortie | Attention CV | Attention traduction |',
    '|--------|--------|--------------|---------------------|',
    ...results.map(r => `| ${r.originalName} | ${r.outputName} | ${r.attention_cv.replace(/\n/g, ' ')} | ${r.attention_trad.replace(/\n/g, ' ')} |`),
    '',
    '## Notes',
    `- Files processed: ${doneCount}/${meta.files.length}`,
    errorCount > 0 ? `- Errors: ${errorCount}` : '',
    `- Tokens: ${results.filter(r => r.tokenInfo).map(r => r.tokenInfo).join(', ')}`,
  ].filter(Boolean).join('\n');

  // Save as .md.enc (for the batch_summary.docx we'd need docx generation — keeping md for now)
  const encrypted = encrypt(Buffer.from(md), sessionKey);
  await writeFile(join(sessionDir, 'outputs', 'batch_summary.md.enc'), encrypted);

  // Generate ZIP of all profile DOCXs + summary
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  // Add all profile DOCXs
  for (const f of meta.files) {
    if (f.status === 'done' && f.outputName) {
      try {
        const encPath = join(sessionDir, 'outputs', `${f.outputName}.enc`);
        const encData = await readFile(encPath);
        const docxData = decrypt(encData, sessionKey);
        zip.file(f.outputName, docxData);
      } catch { /* skip failed files */ }
    }
  }

  // Add summary markdown
  zip.file('batch_summary.md', md);

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  const encryptedZip = encrypt(zipBuffer, sessionKey);
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12); // YYYYMMDD_HHmm
  const zipName = `${ts.slice(0, 8)}_${ts.slice(8)}_all_profiles.zip`;
  await writeFile(join(sessionDir, 'outputs', `${zipName}.enc`), encryptedZip);
}
