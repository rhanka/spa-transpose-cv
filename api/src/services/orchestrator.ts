import { join } from 'node:path';
import { writeFile, readFile } from 'node:fs/promises';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { getMeta, writeMeta, updateStatus, updateFileStatus, getSessionKey, type SessionMeta } from './session-manager.js';
import { decrypt, encrypt } from './crypto.js';
import { extractTextFromBuffer } from './text-extractor.js';
import { extractCvDataWithRetry, type CvData, type StreamCallbacks } from './cv-agent.js';
import { validateDocxBuffer } from './docx-reader.js';
import {
  sectionHeader, workSectionHeader, skillBullet, sectorCategory, sectorItem,
  emptyPara, jobEntry, educationLine, assembleDocument, getXmlHeader, updateHeader,
} from './scalian-xml.js';
import { unpackDocx, packDocx } from './docx-tools.js';

const TEMPLATE_DIR = join(process.cwd(), 'templates');
const TEMPLATE_DOCX = join(TEMPLATE_DIR, 'Scalian_Template.docx');

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

/**
 * Derive output filename per CLAUDE.md conventions:
 * - Anonymized (source has _XXXXX pattern): Scalian_Profile_Candidate_XXXXX_EN.docx
 * - Nominative: Scalian_Profile_{FirstName}_EN.docx
 */
function deriveOutputName(originalName: string, cvName: string): string {
  // Check if source is anonymized (SCALO pattern with numeric ID)
  const idMatch = originalName.match(/_(\d{4,})[\s.]/);
  if (idMatch) {
    return `Scalian_Profile_Candidate_${idMatch[1]}_EN.docx`;
  }
  // Nominative: use first name (first word of the name)
  const firstName = cvName.split(/\s+/)[0].replace(/[^a-zA-Z]/g, '');
  return `Scalian_Profile_${firstName}_EN.docx`;
}

async function processOneCV(
  sessionId: string,
  fileIndex: number,
  sessionKey: Buffer,
  userPrompt: string,
  originalName: string,
  encryptedName: string,
  emitSse?: SseEmitter,
): Promise<{ cvData: CvData; outputName: string; sourceText: string } | null> {
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

    const cvData = await extractCvDataWithRetry(text, userPrompt, originalName, streamCallbacks);
    logger.info({ sessionId, file: originalName, name: cvData.name }, 'CV data extracted');

    // 3. Build DOCX
    emitSse?.(fileIndex, { phase: 'building_docx', elapsed_ms: Date.now() - startTime });
    const outputName = deriveOutputName(originalName, cvData.name);
    await buildScalianDocx(cvData, sessionDir, fileIndex);

    // 4. Validate DOCX (agent auto-relecture)
    emitSse?.(fileIndex, { phase: 'validating', elapsed_ms: Date.now() - startTime });
    const outputPath = join(sessionDir, 'tmp', `output_${fileIndex}.docx`);
    const outputData = await readFile(outputPath);
    const validation = await validateDocxBuffer(outputData);

    if (!validation.valid) {
      logger.warn({ sessionId, file: originalName, errors: validation.errors }, 'DOCX validation failed');
      emitSse?.(fileIndex, { phase: 'validating', thinking_delta: `Validation errors: ${validation.errors.join(', ')}. Retrying...`, elapsed_ms: Date.now() - startTime });
      // Retry: re-extract with error feedback
      const retryData = await extractCvDataWithRetry(
        text,
        `${userPrompt}\n\nVALIDATION ERRORS FROM PREVIOUS ATTEMPT: ${validation.errors.join('; ')}. Fix these issues.`,
        originalName,
        streamCallbacks,
      );
      await buildScalianDocx(retryData, sessionDir, fileIndex);
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

    logger.info({ sessionId, file: originalName, output: outputName, ms: Date.now() - startTime }, 'CV processed');
    return { cvData, outputName, sourceText: text };

  } catch (err) {
    logger.error({ sessionId, file: originalName, err }, 'CV processing failed');
    await updateFileStatus(sessionId, fileIndex, 'error', { error: (err as Error).message });
    emitSse?.(fileIndex, { phase: 'error', error: (err as Error).message, elapsed_ms: Date.now() - startTime });
    return null;
  }
}

async function buildScalianDocx(
  data: CvData,
  sessionDir: string,
  fileIndex: number,
): Promise<void> {
  const workDir = join(sessionDir, 'tmp', `work_${fileIndex}`);
  await unpackDocx(TEMPLATE_DOCX, workDir);

  const P: string[] = [];

  // Technical Skills
  P.push(sectionHeader('Technical SKILLS'));
  for (const skill of data.technicalSkills.slice(0, 7)) {
    P.push(skillBullet(escapeXml(skill.label), escapeXml(skill.description)));
  }

  // Sector-Specific Skills
  P.push(sectionHeader('SECTOR-SPECIFIC SKILLS'));
  if (data.sectors.length > 0) {
    P.push(sectorCategory('Sectors'));
    data.sectors.forEach((s, i) => {
      P.push(sectorItem(escapeXml(s), i === data.sectors.length - 1 && data.domains.length === 0));
    });
  }
  if (data.domains.length > 0) {
    P.push(sectorCategory('Domains'));
    data.domains.forEach((d, i) => {
      P.push(sectorItem(escapeXml(d), i === data.domains.length - 1));
    });
  }

  // Work Experience
  P.push(workSectionHeader('WORK EXPERIENCE'));
  P.push(emptyPara());
  for (const job of data.experience) {
    P.push(...jobEntry({
      company: escapeXml(job.company),
      description: escapeXml(job.description),
      dates: escapeXml(job.dates),
      title: escapeXml(job.title),
      tasks: job.tasks.map(t => escapeXml(t)),
      achievements: job.achievements.map(a => escapeXml(a)),
      techEnvironment: escapeXml(job.techEnvironment),
    }));
  }

  // Languages
  P.push(sectionHeader('LANGUAGES SKILLS'));
  for (const lang of data.languages) {
    P.push(skillBullet(escapeXml(lang.label), escapeXml(lang.level)));
  }

  // Education
  P.push(sectionHeader('EDUCATION/CERTIFICATION'));
  for (const edu of data.education) {
    P.push(educationLine(escapeXml(edu.year), escapeXml(edu.description)));
  }

  // Assemble document.xml
  const xmlHeader = await getXmlHeader(join(workDir, 'word', 'document.xml'));
  const doc = assembleDocument(P, xmlHeader);
  await writeFile(join(workDir, 'word', 'document.xml'), doc);

  // Update header — field names per CLAUDE.md
  await updateHeader(
    join(workDir, 'word', 'header2.xml'),
    escapeXml(data.name),
    escapeXml(data.title_line1),
    escapeXml(data.title_line2),
    data.years,
  );

  // Pack
  const outputPath = join(sessionDir, 'tmp', `output_${fileIndex}.docx`);
  await packDocx(workDir, outputPath, TEMPLATE_DOCX);
}

/**
 * Conductor: validate a generated DOCX and produce attention_trad via Claude QA call
 */
async function conductorValidate(
  sessionId: string,
  fileIndex: number,
  sessionKey: Buffer,
  originalName: string,
  outputName: string,
  sourceText: string,
  emitSse?: SseEmitter,
): Promise<string> {
  const sessionDir = join(env.DATA_DIR, sessionId);
  const encOutputPath = join(sessionDir, 'outputs', `${outputName}.enc`);

  try {
    const encData = await readFile(encOutputPath);
    const docxData = decrypt(encData, sessionKey);
    const { extractTextFromDocxBuffer } = await import('./docx-reader.js');
    const outputText = await extractTextFromDocxBuffer(docxData);

    // Structural validation
    const validation = await validateDocxBuffer(docxData);
    const structErrors = validation.valid ? [] : validation.errors;

    // Claude QA analyst call for translation quality
    emitSse?.(fileIndex, { phase: 'validating', thinking_delta: 'Conductor: analyse qualité traduction...', elapsed_ms: 0 });

    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    const qaResponse = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: `You are a QA analyst reviewing a CV conversion from source to Scalian format.
Compare the source CV text with the generated output text.
Return ONLY a concise markdown analysis (3-5 bullet points max) covering:
- Job titles that may have been misinterpreted
- Ambiguous technical terms in the mapping
- Company names or certifications that may have been altered
- Questionable consolidation choices (long careers)
- Sections that seem too thin or too dense vs source
- Overall format completeness and translation quality

If everything looks good, return "— Aucun point d'attention majeur".
Be CONCISE — only major issues. Markdown bullet points.`,
      messages: [{
        role: 'user',
        content: `SOURCE FILE: ${originalName}\n\nSOURCE TEXT (first 3000 chars):\n${sourceText.substring(0, 3000)}\n\n---\n\nGENERATED OUTPUT TEXT:\n${outputText.substring(0, 3000)}${structErrors.length > 0 ? `\n\nSTRUCTURAL VALIDATION ERRORS: ${structErrors.join('; ')}` : ''}`,
      }],
    });

    const text = qaResponse.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text)
      .join('');

    return text.trim() || '—';
  } catch (err) {
    logger.error({ sessionId, file: originalName, err }, 'Conductor validation error');
    return `Erreur validation: ${(err as Error).message}`;
  }
}

export async function runOrchestrator(sessionId: string, emitSse?: SseEmitter): Promise<void> {
  logger.info({ sessionId }, 'Orchestrator started');

  const meta = await getMeta(sessionId);
  if (!meta) throw new Error(`Session ${sessionId} not found`);

  const sessionKey = getSessionKey(sessionId);
  if (!sessionKey) throw new Error(`No key in cache for session ${sessionId}`);

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

  logger.info({ sessionId, fileCount: meta.files.length, concurrency }, 'Launching parallel CV processing');

  // Results for batch summary
  const results: { originalName: string; outputName: string; attention_cv: string; attention_trad: string }[] = [];

  const tasks = meta.files.map(async (_, idx) => {
    await acquire();
    try {
      const f = meta.files[idx];
      logger.info({ sessionId, fileIndex: idx, file: f.originalName }, 'Processing CV');
      const result = await processOneCV(sessionId, idx, sessionKey, meta.prompt, f.originalName, f.encryptedName, emitSse);

      if (result) {
        // Conductor validation
        const attention_trad = await conductorValidate(sessionId, idx, sessionKey, f.originalName, result.outputName, result.sourceText, emitSse);
        emitSse?.(idx, { phase: 'done', attention_trad });
        results.push({
          originalName: f.originalName,
          outputName: result.outputName,
          attention_cv: result.cvData.attention_cv || '—',
          attention_trad,
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
  results: { originalName: string; outputName: string; attention_cv: string; attention_trad: string }[],
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
    '## Notes du conductor',
    `- Fichiers traités : ${doneCount}/${meta.files.length}`,
    errorCount > 0 ? `- Échecs : ${errorCount}` : '',
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
  await writeFile(join(sessionDir, 'outputs', 'batch_all_profiles.zip.enc'), encryptedZip);
}
