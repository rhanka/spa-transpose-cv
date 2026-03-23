import { join } from 'node:path';
import { cp, writeFile, readFile } from 'node:fs/promises';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { getMeta, writeMeta, updateStatus, getSessionKey } from './session-manager.js';
import { decrypt, encrypt } from './crypto.js';
import { extractTextFromBuffer } from './text-extractor.js';
import { extractCvData, type CvData } from './cv-agent.js';
import {
  sectionHeader, workSectionHeader, skillBullet, sectorCategory, sectorItem,
  emptyPara, jobEntry, educationLine, assembleDocument, getXmlHeader, updateHeader,
} from './scalian-xml.js';
import { unpackDocx, packDocx } from './docx-tools.js';

const TEMPLATE_DIR = join(process.cwd(), 'templates');
const TEMPLATE_DOCX = join(TEMPLATE_DIR, 'Scalian_Template.docx');

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
): Promise<void> {
  const meta = await getMeta(sessionId);
  if (!meta) throw new Error(`Session ${sessionId} not found`);

  const file = meta.files[fileIndex];
  const sessionDir = join(env.DATA_DIR, sessionId);

  // Mark as processing
  file.status = 'processing';
  await writeMeta(meta);

  try {
    // 1. Decrypt input
    const encryptedData = await readFile(join(sessionDir, 'inputs', file.encryptedName));
    const rawData = decrypt(encryptedData, sessionKey);

    // 2. Extract text
    const text = await extractTextFromBuffer(rawData, file.originalName);
    logger.info({ sessionId, file: file.originalName, textLength: text.length }, 'Text extracted');

    // 3. Call Claude to extract structured data
    const cvData = await extractCvData(text, userPrompt);
    logger.info({ sessionId, file: file.originalName, name: cvData.fullName }, 'CV data extracted');

    // 4. Build DOCX
    const outputName = `Scalian_Profile_${cvData.fullName.replace(/[^a-zA-Z0-9]/g, '_')}_EN.docx`;
    await buildScalianDocx(cvData, sessionDir, fileIndex, outputName);

    // 5. Encrypt output
    const outputDocx = await readFile(join(sessionDir, 'tmp', `output_${fileIndex}.docx`));
    const encryptedOutput = encrypt(outputDocx, sessionKey);
    await writeFile(join(sessionDir, 'outputs', `${outputName}.enc`), encryptedOutput);

    // 6. Update meta
    const freshMeta = await getMeta(sessionId);
    if (freshMeta) {
      freshMeta.files[fileIndex].status = 'done';
      freshMeta.files[fileIndex].outputName = outputName;
      await writeMeta(freshMeta);
    }

    logger.info({ sessionId, file: file.originalName, output: outputName }, 'CV processed');
  } catch (err) {
    logger.error({ sessionId, file: file.originalName, err }, 'CV processing failed');
    const freshMeta = await getMeta(sessionId);
    if (freshMeta) {
      freshMeta.files[fileIndex].status = 'error';
      freshMeta.files[fileIndex].error = (err as Error).message;
      await writeMeta(freshMeta);
    }
  }
}

async function buildScalianDocx(
  data: CvData,
  sessionDir: string,
  fileIndex: number,
  outputName: string,
): Promise<void> {
  const workDir = join(sessionDir, 'tmp', `work_${fileIndex}`);

  // Unpack template
  await unpackDocx(TEMPLATE_DOCX, workDir);

  // Build paragraphs
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
  // page_break on last sector_item (handled by the boolean above)

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

  // Update header
  await updateHeader(
    join(workDir, 'word', 'header2.xml'),
    escapeXml(data.fullName),
    escapeXml(data.titleLine1),
    escapeXml(data.titleLine2),
    data.yearsExperience,
  );

  // Pack
  const outputPath = join(sessionDir, 'tmp', `output_${fileIndex}.docx`);
  await packDocx(workDir, outputPath, TEMPLATE_DOCX);
}

export async function runOrchestrator(sessionId: string): Promise<void> {
  logger.info({ sessionId }, 'Orchestrator started');

  const meta = await getMeta(sessionId);
  if (!meta) throw new Error(`Session ${sessionId} not found`);

  const sessionKey = getSessionKey(sessionId);
  if (!sessionKey) throw new Error(`No key in cache for session ${sessionId}`);

  // Process CVs in parallel, limited by MAX_CONCURRENT_AGENTS
  const concurrency = env.MAX_CONCURRENT_AGENTS;
  const fileIndexes = meta.files.map((_, i) => i);

  // Simple concurrency pool
  const pool: Promise<void>[] = [];
  for (const idx of fileIndexes) {
    const p = processOneCV(sessionId, idx, sessionKey, meta.prompt);
    pool.push(p);

    if (pool.length >= concurrency) {
      await Promise.race(pool);
      // Remove settled promises
      for (let i = pool.length - 1; i >= 0; i--) {
        const status = await Promise.race([pool[i].then(() => 'done'), Promise.resolve('pending')]);
        if (status === 'done') pool.splice(i, 1);
      }
    }
  }
  await Promise.allSettled(pool);

  // Final status
  const finalMeta = await getMeta(sessionId);
  if (finalMeta) {
    const allDone = finalMeta.files.every(f => f.status === 'done' || f.status === 'error');
    const hasErrors = finalMeta.files.some(f => f.status === 'error');
    finalMeta.status = allDone ? (hasErrors ? 'error' : 'done') : 'error';

    // Generate batch summary
    await generateBatchSummary(finalMeta, sessionKey);
    await writeMeta(finalMeta);
  }

  logger.info({ sessionId, fileCount: meta.files.length }, 'Orchestrator completed');
}

async function generateBatchSummary(meta: Awaited<ReturnType<typeof getMeta>>, sessionKey: Buffer): Promise<void> {
  if (!meta) return;
  const sessionDir = join(env.DATA_DIR, meta.id);

  const lines = [
    '# Scalian CV Batch Summary\n',
    '| Input | Output | Status |',
    '|-------|--------|--------|',
  ];

  for (const f of meta.files) {
    const status = f.status === 'done' ? 'OK' : `ERROR: ${f.error || 'unknown'}`;
    lines.push(`| ${f.originalName} | ${f.outputName || '—'} | ${status} |`);
  }

  lines.push('');
  lines.push(`## Notes`);
  lines.push(`- Files processed: ${meta.files.filter(f => f.status === 'done').length}/${meta.files.length}`);
  lines.push(`- Errors: ${meta.files.filter(f => f.status === 'error').length}`);

  const md = lines.join('\n');
  const encrypted = encrypt(Buffer.from(md), sessionKey);
  await writeFile(join(sessionDir, 'outputs', 'batch_summary.md.enc'), encrypted);
}
