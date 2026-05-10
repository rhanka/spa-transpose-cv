import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultLogger as logger } from '../util/log.js';

const execFileAsync = promisify(execFile);

export interface ValidatePage1Options {
  /** Experience section heading. If null/empty, the overflow check is skipped. */
  experienceSectionLabel: string | null;
  /** Sector/skills section heading. If null/empty, the underflow check is skipped. */
  sectorSectionLabel: string | null;
}

export interface Page1Validation {
  warnings: string[];
}

/**
 * Convert a DOCX to PDF (page 1 only) via LibreOffice headless and check that
 * the experience section label is NOT on page 1 (overflow) and the sector
 * (skills) section label IS on page 1 (underflow).
 *
 * Saturation-safe pattern: isolated LO profile (`-env:UserInstallation`),
 * mkdtemp workdir, finally rm, errors surfaced as warnings (not swallowed).
 * DO NOT alter this contract — it's the fix for a 414 GB writable-layer leak.
 */
export async function validatePage1(
  docxBytes: Uint8Array,
  opts: ValidatePage1Options,
): Promise<Page1Validation> {
  const warnings: string[] = [];
  const workDir = await mkdtemp(join(tmpdir(), 'lo-page1-'));
  const profileDir = join(workDir, 'profile');
  const docxPath = join(workDir, 'in.docx');

  try {
    await writeFile(docxPath, Buffer.from(docxBytes));
    await execFileAsync(
      'libreoffice',
      [
        `-env:UserInstallation=file://${profileDir}`,
        '--headless',
        '--convert-to', 'pdf',
        '--outdir', workDir,
        docxPath,
      ],
      { timeout: 30_000 },
    );

    const pdfPath = join(workDir, 'in.pdf');
    const { stdout: page1 } = await execFileAsync(
      'pdftotext',
      ['-f', '1', '-l', '1', pdfPath, '-'],
      { maxBuffer: 1024 * 1024 },
    );

    const upper = page1.toUpperCase();
    if (
      opts.experienceSectionLabel &&
      upper.includes(opts.experienceSectionLabel.toUpperCase())
    ) {
      warnings.push(
        `Page 1 overflow: ${opts.experienceSectionLabel} found on page 1 — skills/sectors are too short or page break missing`,
      );
    }

    if (
      opts.sectorSectionLabel &&
      !upper.includes(opts.sectorSectionLabel.toUpperCase())
    ) {
      warnings.push(
        `Page 1 overflow: ${opts.sectorSectionLabel} not found on page 1 — skills descriptions are too long`,
      );
    }
  } catch (err) {
    const message = (err as Error).message;
    logger.error('PDF validation failed (LibreOffice error)', { docxPath, err: message });
    warnings.push(`PDF validation failed: ${message}`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }

  return { warnings };
}
