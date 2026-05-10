import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logger } from '../config/logger.js';

const execFileAsync = promisify(execFile);

export async function extractText(filePath: string): Promise<string> {
  const ext = filePath.split('.').pop()?.toLowerCase();

  try {
    switch (ext) {
      case 'pdf':
        return await extractPdf(filePath);
      case 'docx':
        return await extractDocx(filePath);
      case 'doc':
        return await extractDoc(filePath);
      default:
        throw new Error(`Unsupported file type: .${ext}`);
    }
  } catch (err) {
    logger.error({ filePath, err }, 'Text extraction failed');
    throw err;
  }
}

async function extractPdf(filePath: string): Promise<string> {
  const { stdout } = await execFileAsync('pdftotext', ['-layout', filePath, '-'], {
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

async function extractDocx(filePath: string): Promise<string> {
  // Pure TS extraction via jszip + xmldom — no pandoc needed
  const { extractTextFromDocx } = await import('./docx-reader.js');
  return extractTextFromDocx(filePath);
}

async function extractDoc(filePath: string): Promise<string> {
  const workDir = await mkdtemp(join(tmpdir(), 'doc-extract-'));
  const profileDir = join(workDir, 'profile');
  const tmpDoc = join(workDir, 'input.doc');

  try {
    const data = await readFile(filePath);
    await writeFile(tmpDoc, data);

    await execFileAsync('libreoffice', [
      `-env:UserInstallation=file://${profileDir}`,
      '--headless',
      '--convert-to', 'docx',
      '--outdir', workDir,
      tmpDoc,
    ], { timeout: 60_000 });

    const tmpDocx = join(workDir, 'input.docx');
    return await extractDocx(tmpDocx);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function extractTextFromBuffer(data: Buffer, originalName: string): Promise<string> {
  const workDir = await mkdtemp(join(tmpdir(), 'extract-'));
  const tmpFile = join(workDir, originalName);
  try {
    await writeFile(tmpFile, data);
    return await extractText(tmpFile);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
