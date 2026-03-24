import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';

/**
 * Extract all text from a DOCX file by reading word/document.xml
 * and collecting all <w:t> text nodes.
 * No pandoc needed — pure JS via jszip + xmldom.
 */
export async function extractTextFromDocx(docxPath: string): Promise<string> {
  const data = await readFile(docxPath);
  return extractTextFromDocxBuffer(data);
}

export async function extractTextFromDocxBuffer(data: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(data);
  const docXml = zip.file('word/document.xml');
  if (!docXml) throw new Error('No word/document.xml found in DOCX');
  const xml = await docXml.async('string');
  return extractTextFromXml(xml);
}

/**
 * Extract plain text from OOXML document.xml content.
 * Walks all <w:p> paragraphs, joining <w:t> runs with spaces,
 * and paragraphs with newlines.
 */
export function extractTextFromXml(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const paragraphs: string[] = [];

  const pNodes = doc.getElementsByTagName('w:p');
  for (let i = 0; i < pNodes.length; i++) {
    const p = pNodes[i];
    const runs: string[] = [];
    const tNodes = p.getElementsByTagName('w:t');
    for (let j = 0; j < tNodes.length; j++) {
      const t = tNodes[j];
      if (t.textContent) runs.push(t.textContent);
    }
    paragraphs.push(runs.join(''));
  }

  return paragraphs.join('\n');
}

/**
 * Validation: count paragraphs before WORK EXPERIENCE header.
 * Returns the count — if > 28, page 1 overflows.
 */
export function countPage1Paragraphs(xml: string): number {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const pNodes = doc.getElementsByTagName('w:p');
  let count = 0;
  for (let i = 0; i < pNodes.length; i++) {
    const tNodes = pNodes[i].getElementsByTagName('w:t');
    let text = '';
    for (let j = 0; j < tNodes.length; j++) {
      text += tNodes[j].textContent || '';
    }
    if (text.includes('WORK EXPERIENCE')) return count;
    count++;
  }
  return count; // WORK EXPERIENCE not found
}

/**
 * Validate a generated DOCX:
 * - 5 required sections present
 * - No raw XML entities leaked (&amp; &#x2013; etc in plain text)
 * - Page 1 doesn't overflow (<=28 paragraphs before WORK EXPERIENCE)
 * Returns { valid, errors }
 */
export async function validateDocx(docxPath: string): Promise<{ valid: boolean; errors: string[] }> {
  const data = await readFile(docxPath);
  return validateDocxBuffer(data);
}

export async function validateDocxBuffer(data: Buffer): Promise<{ valid: boolean; errors: string[] }> {
  const zip = await JSZip.loadAsync(data);
  const docXml = zip.file('word/document.xml');
  if (!docXml) return { valid: false, errors: ['No word/document.xml in DOCX'] };

  const xml = await docXml.async('string');
  const text = extractTextFromXml(xml);
  const errors: string[] = [];

  // Check 5 required sections
  const required = ['TECHNICAL SKILLS', 'SECTOR-SPECIFIC SKILLS', 'WORK EXPERIENCE', 'LANGUAGES SKILLS', 'EDUCATION/CERTIFICATION'];
  for (const section of required) {
    if (!text.toUpperCase().includes(section.toUpperCase())) {
      errors.push(`Missing section: ${section}`);
    }
  }

  // Check for leaked XML entities
  if (/&amp;|&#x[0-9a-fA-F]+;|&lt;|&gt;/.test(text)) {
    errors.push('Raw XML entities leaked into text content');
  }

  // Check page 1 overflow
  const p1count = countPage1Paragraphs(xml);
  if (p1count > 28) {
    errors.push(`Page 1 overflow: ${p1count} paragraphs before WORK EXPERIENCE (max 28)`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Extract header info from header2.xml
 */
export async function extractHeaderInfo(docxPath: string): Promise<{ name: string; title_line1: string; title_line2: string; years: string }> {
  const data = await readFile(docxPath);
  const zip = await JSZip.loadAsync(data);
  const headerXml = zip.file('word/header2.xml');
  if (!headerXml) return { name: '', title_line1: '', title_line2: '', years: '' };

  const xml = await headerXml.async('string');
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const tNodes = doc.getElementsByTagName('w:t');
  const texts: string[] = [];
  for (let i = 0; i < tNodes.length; i++) {
    const t = tNodes[i].textContent?.trim();
    if (t) texts.push(t);
  }

  // Header has: name, title_line1, title_line2, years (+ "years" label)
  // The order depends on the template but we can extract by position
  return {
    name: texts[0] || '',
    title_line1: texts[1] || '',
    title_line2: texts[2] || '',
    years: texts[3] || '',
  };
}
