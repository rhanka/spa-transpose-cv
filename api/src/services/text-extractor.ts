import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
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
  // Convert .doc to .docx first using LibreOffice
  const tmpDir = '/tmp';
  const tmpName = `doc_${randomBytes(8).toString('hex')}`;
  const tmpDoc = join(tmpDir, `${tmpName}.doc`);

  // Copy to tmp with known name
  const data = await import('node:fs/promises').then(fs => fs.readFile(filePath));
  await writeFile(tmpDoc, data);

  await execFileAsync('libreoffice', [
    '--headless', '--convert-to', 'docx', '--outdir', tmpDir, tmpDoc,
  ], { timeout: 60_000 });

  const tmpDocx = join(tmpDir, `${tmpName}.docx`);
  const text = await extractDocx(tmpDocx);

  // Cleanup
  await unlink(tmpDoc).catch(() => {});
  await unlink(tmpDocx).catch(() => {});

  return text;
}

export async function extractTextFromBuffer(data: Buffer, originalName: string): Promise<string> {
  const tmpDir = '/tmp';
  const tmpFile = join(tmpDir, `extract_${randomBytes(8).toString('hex')}_${originalName}`);
  await writeFile(tmpFile, data);
  try {
    return await extractText(tmpFile);
  } finally {
    await unlink(tmpFile).catch(() => {});
  }
}
