/**
 * docx-tools.ts — Unpack/pack/validate for .docx files.
 *
 * TypeScript port of scalian_docx_tools.py using JSZip and @xmldom/xmldom.
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile, readdir, mkdir, rm, cp, stat, mkdtemp } from 'node:fs/promises';
import { join, relative, dirname, extname } from 'node:path';
import { tmpdir } from 'node:os';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

// ── Smart quote entities ─────────────────────────────────────────────────────

const SMART_QUOTE_REPLACEMENTS: Record<string, string> = {
  '\u201c': '&#x201C;', // left double quote
  '\u201d': '&#x201D;', // right double quote
  '\u2018': '&#x2018;', // left single quote
  '\u2019': '&#x2019;', // right single quote
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Recursively list all files in a directory. */
async function walk(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

/** List all .xml and .rels files in a directory recursively. */
async function findXmlFiles(dir: string): Promise<string[]> {
  const all = await walk(dir);
  return all.filter((f) => f.endsWith('.xml') || f.endsWith('.rels'));
}

/** Pretty-print an XML file in place. */
async function prettyPrintXml(xmlFile: string): Promise<void> {
  try {
    const content = await readFile(xmlFile, 'utf-8');
    const doc = new DOMParser().parseFromString(content, 'text/xml');
    const serialized = new XMLSerializer().serializeToString(doc);
    // Basic indentation: xmldom doesn't auto-indent, but we get a clean serialization
    await writeFile(xmlFile, serialized, 'utf-8');
  } catch {
    // skip non-parseable files
  }
}

/** Replace literal smart quotes with XML entities. */
async function escapeSmartQuotes(xmlFile: string): Promise<void> {
  try {
    let content = await readFile(xmlFile, 'utf-8');
    for (const [char, entity] of Object.entries(SMART_QUOTE_REPLACEMENTS)) {
      content = content.replaceAll(char, entity);
    }
    await writeFile(xmlFile, content, 'utf-8');
  } catch {
    // skip
  }
}

// ── UNPACK ───────────────────────────────────────────────────────────────────

/**
 * Unpack a .docx file for editing.
 *
 * 1. Extract ZIP contents
 * 2. Pretty-print all XML files
 * 3. Escape smart quotes to XML entities
 */
export async function unpackDocx(
  docxPath: string,
  outputDir: string,
): Promise<[boolean, string]> {
  if (!existsSync(docxPath)) {
    return [false, `Error: ${docxPath} does not exist`];
  }

  try {
    const data = await readFile(docxPath);
    const zip = await JSZip.loadAsync(data);

    await mkdir(outputDir, { recursive: true });

    // Extract all files
    for (const [path, file] of Object.entries(zip.files)) {
      const fullPath = join(outputDir, path);
      if (file.dir) {
        await mkdir(fullPath, { recursive: true });
      } else {
        await mkdir(dirname(fullPath), { recursive: true });
        const content = await file.async('nodebuffer');
        await writeFile(fullPath, content);
      }
    }

    const xmlFiles = await findXmlFiles(outputDir);

    // Pretty-print XML files
    for (const f of xmlFiles) {
      await prettyPrintXml(f);
    }

    // Escape smart quotes
    for (const f of xmlFiles) {
      await escapeSmartQuotes(f);
    }

    return [true, `Unpacked ${docxPath} (${xmlFiles.length} XML files)`];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [false, `Error unpacking: ${msg}`];
  }
}

// ── VALIDATE ─────────────────────────────────────────────────────────────────

/**
 * Validate all XML files in an unpacked docx directory.
 *
 * Checks:
 * 1. Every .xml and .rels file parses without error
 * 2. document.xml exists
 * 3. Paragraph count comparison (if original provided)
 */
export async function validateDocxDir(
  unpackedDir: string,
  originalDocx?: string,
): Promise<[boolean, string]> {
  const xmlFiles = await findXmlFiles(unpackedDir);

  if (xmlFiles.length === 0) {
    return [false, `Error: no XML files found in ${unpackedDir}`];
  }

  // Check all XML files parse
  const errors: string[] = [];
  for (const xmlFile of xmlFiles) {
    try {
      const content = await readFile(xmlFile, 'utf-8');
      let parseError: string | undefined;
      const doc = new DOMParser({
        onError: (level: string, msg: string) => {
          if (level === 'error' || level === 'fatalError') {
            parseError = msg;
          }
        },
      } as any).parseFromString(content, 'text/xml');
      if (parseError) throw new Error(parseError);
      if (!doc) throw new Error('Parse returned null');
    } catch (e) {
      const rel = relative(unpackedDir, xmlFile);
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`  ${rel}: ${msg}`);
    }
  }

  if (errors.length > 0) {
    return [false, `FAILED - Found ${errors.length} XML violations:\n${errors.join('\n')}`];
  }

  // Check document.xml exists
  const docXml = join(unpackedDir, 'word', 'document.xml');
  if (!existsSync(docXml)) {
    return [false, 'Error: word/document.xml not found'];
  }

  // Count paragraphs
  const newCount = await countParagraphsInDir(docXml);
  let msg = '';

  if (originalDocx) {
    const originalCount = await countParagraphsInDocx(originalDocx);
    const diff = newCount - originalCount;
    const diffStr = diff > 0 ? `+${diff}` : String(diff);
    msg = `\nParagraphs: ${originalCount} → ${newCount} (${diffStr})\n`;
  } else {
    msg = `\nParagraphs: ${newCount}\n`;
  }

  msg += 'All validations PASSED!';
  return [true, msg];
}

/** Count <w:p> elements in a document.xml file. */
async function countParagraphsInDir(docXmlPath: string): Promise<number> {
  const content = await readFile(docXmlPath, 'utf-8');
  return (content.match(/<w:p[\s>]/g) || []).length;
}

/** Count paragraphs in a packed .docx file. */
async function countParagraphsInDocx(docxPath: string): Promise<number> {
  const data = await readFile(docxPath);
  const zip = await JSZip.loadAsync(data);
  const docXml = zip.file('word/document.xml');
  if (!docXml) return 0;
  const content = await docXml.async('string');
  return (content.match(/<w:p[\s>]/g) || []).length;
}

// ── STRIP EMBEDDED FONTS ─────────────────────────────────────────────────────

/**
 * Remove embedded font files (.odttf) and their references.
 * Reduces ~2.8MB → ~30KB.
 */
async function stripEmbeddedFonts(contentDir: string): Promise<void> {
  // Remove font files
  const fontsDir = join(contentDir, 'word', 'fonts');
  if (existsSync(fontsDir)) {
    await rm(fontsDir, { recursive: true, force: true });
  }

  // Clean fontTable.xml: remove embed* elements
  const fontTable = join(contentDir, 'word', 'fontTable.xml');
  if (existsSync(fontTable)) {
    let text = await readFile(fontTable, 'utf-8');
    text = text.replace(/<w:embed\w+[^/]*\/>\s*/g, '');
    await writeFile(fontTable, text, 'utf-8');
  }

  // Clean fontTable.xml.rels: remove font relationship entries
  const fontRels = join(contentDir, 'word', '_rels', 'fontTable.xml.rels');
  if (existsSync(fontRels)) {
    let text = await readFile(fontRels, 'utf-8');
    text = text.replace(/<Relationship[^>]*Target="fonts\/[^"]*"[^/]*\/>\s*/g, '');
    await writeFile(fontRels, text, 'utf-8');
  }

  // Clean [Content_Types].xml: remove odttf entries
  const contentTypes = join(contentDir, '[Content_Types].xml');
  if (existsSync(contentTypes)) {
    let text = await readFile(contentTypes, 'utf-8');
    text = text.replace(/<Override[^>]*\.odttf[^/]*\/>\s*/g, '');
    text = text.replace(/<Default[^>]*odttf[^/]*\/>\s*/g, '');
    await writeFile(contentTypes, text, 'utf-8');
  }
}

// ── CONDENSE XML ─────────────────────────────────────────────────────────────

/**
 * Remove whitespace-only text nodes and comments from XML,
 * but preserve content inside w:t elements.
 */
async function condenseXml(xmlFile: string): Promise<void> {
  try {
    const content = await readFile(xmlFile, 'utf-8');
    const doc = new DOMParser().parseFromString(content, 'text/xml');

    const elements = doc.getElementsByTagName('*');
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i]!;
      // Skip w:t elements — their whitespace matters
      if (el.tagName.endsWith(':t')) continue;

      const toRemove: Array<ReturnType<typeof el.childNodes.item>> = [];
      for (let j = 0; j < el.childNodes.length; j++) {
        const child = el.childNodes[j];
        if (!child) continue;
        if (
          (child.nodeType === 3 /* TEXT_NODE */ &&
            child.nodeValue &&
            child.nodeValue.trim() === '') ||
          child.nodeType === 8 /* COMMENT_NODE */
        ) {
          toRemove.push(child);
        }
      }
      for (const node of toRemove) {
        if (node) el.removeChild(node);
      }
    }

    const serialized = new XMLSerializer().serializeToString(doc);
    await writeFile(xmlFile, serialized, 'utf-8');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Warning: could not condense ${xmlFile}: ${msg}`);
  }
}

// ── PACK ─────────────────────────────────────────────────────────────────────

/**
 * Pack a directory into a .docx file.
 *
 * 1. Validate all XML (fails fast if broken)
 * 2. Strip embedded fonts (default: on)
 * 3. Condense XML (remove whitespace-only text nodes)
 * 4. Write ZIP
 */
export async function packDocx(
  inputDir: string,
  outputDocx: string,
  originalDocx?: string,
  stripFonts = true,
): Promise<[boolean, string]> {
  if (!existsSync(inputDir)) {
    return [false, `Error: ${inputDir} is not a directory`];
  }

  // Validate first
  const [valid, validMsg] = await validateDocxDir(inputDir, originalDocx);
  console.log(validMsg);
  if (!valid) {
    return [false, `Error: Validation failed for ${inputDir}`];
  }

  // Work on a temp copy (in system tmp to avoid copying into self)
  const tmpDir = await mkdtemp(join(tmpdir(), 'docx-pack-'));
  const tmpContent = join(tmpDir, 'content');
  try {
    await cp(inputDir, tmpContent, { recursive: true });

    // Strip embedded fonts
    if (stripFonts) {
      await stripEmbeddedFonts(tmpContent);
    }

    // Condense XML files
    const xmlFiles = await findXmlFiles(tmpContent);
    for (const f of xmlFiles) {
      await condenseXml(f);
    }

    // Build ZIP
    const zip = new JSZip();
    const allFiles = await walk(tmpContent);
    for (const filePath of allFiles) {
      const rel = relative(tmpContent, filePath);
      const content = await readFile(filePath);
      zip.file(rel, content);
    }

    const outputDir = dirname(outputDocx);
    await mkdir(outputDir, { recursive: true });

    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
    await writeFile(outputDocx, buffer);

    return [true, `Successfully packed ${inputDir} to ${outputDocx}`];
  } finally {
    // Clean up temp directory
    await rm(tmpDir, { recursive: true, force: true });
  }
}
