/**
 * font-embedding.ts — Embed TrueType fonts into a packed .docx per OOXML spec.
 *
 * Spec refs:
 *   - ECMA-376 Part 1 §17.8 (Fonts)
 *   - ECMA-376 Part 1 §17.8.1 (Obfuscated font data — ODTTF)
 *
 * Obfuscation: the first 32 bytes of the TTF are XORed against a 16-byte GUID.
 * The GUID is applied twice (bytes 1-16, then bytes 17-32), each time in
 * "reversed-byte" form: if the GUID textual form is {XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX},
 * the binary representation stored in the relationship is taken as-is in the
 * canonical GUID layout (little-endian for the first 3 groups), and ODTTF
 * obfuscation XORs each 16-byte pass against those 16 bytes in **reverse
 * order** (LSB first in the file).
 *
 * In practice the safe recipe (matches MS Word / LibreOffice):
 *   1. Pick a GUID, format it as "{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}".
 *   2. Strip braces and hyphens → 32 hex chars → parse into 16 bytes `g[0..15]`.
 *   3. Build the XOR key `k[0..15]` where `k[i] = g[15 - i]` (reverse order).
 *   4. XOR bytes 0..15 of the TTF with k, then XOR bytes 16..31 with k.
 *   5. Store w:fontKey="{XXXX...}" in fontTable.xml — with the original
 *      hex order (not reversed).
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import JSZip from 'jszip';

export interface LatoFontSource {
  /** Absolute path to Lato-Regular.ttf */
  regular: string;
  /** Absolute path to Lato-Bold.ttf */
  bold: string;
  /** Absolute path to Lato-Italic.ttf */
  italic: string;
  /** Absolute path to Lato-BoldItalic.ttf */
  boldItalic: string;
}

type Variant = 'regular' | 'bold' | 'italic' | 'boldItalic';

const VARIANT_EMBED_TAG: Record<Variant, string> = {
  regular: 'w:embedRegular',
  bold: 'w:embedBold',
  italic: 'w:embedItalic',
  boldItalic: 'w:embedBoldItalic',
};

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';

/** Format 16 random bytes as "{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}" (upper-case). */
function makeGuid(): { text: string; bytes: Buffer } {
  const buf = randomBytes(16);
  const hex = buf.toString('hex').toUpperCase();
  const text =
    `{${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}}`;
  return { text, bytes: buf };
}

/**
 * Apply ODTTF obfuscation to TTF bytes.
 *
 * The XOR key is the 16 bytes of the GUID in reverse order (LSB first).
 * Obfuscation is applied to the first 32 bytes of the file, as two 16-byte
 * passes against the same key.
 */
function obfuscateTtf(ttf: Buffer, guidBytes: Buffer): Buffer {
  if (guidBytes.length !== 16) {
    throw new Error(`GUID must be 16 bytes, got ${guidBytes.length}`);
  }
  const out = Buffer.from(ttf); // copy
  const key = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) {
    // Reverse byte order: LSB first in file, so k[i] = guid[15-i]
    key[i] = guidBytes[15 - i]!;
  }
  for (let i = 0; i < 16 && i < out.length; i++) {
    out[i] = out[i]! ^ key[i]!;
  }
  for (let i = 0; i < 16 && 16 + i < out.length; i++) {
    out[16 + i] = out[16 + i]! ^ key[i]!;
  }
  return out;
}

interface PreparedFontPart {
  variant: Variant;
  partName: string; // "word/fonts/latoRegular.odttf"
  bytes: Buffer;
  guidText: string; // "{XXXX...}"
  relId: string; // "rIdFontLatoRegular"
}

async function prepareFontPart(variant: Variant, ttfPath: string): Promise<PreparedFontPart> {
  const ttf = await readFile(ttfPath);
  const { text: guidText, bytes: guidBytes } = makeGuid();
  const obfuscated = obfuscateTtf(ttf, guidBytes);
  const fileName = `lato${variant[0]!.toUpperCase()}${variant.slice(1)}.odttf`;
  return {
    variant,
    partName: `word/fonts/${fileName}`,
    bytes: obfuscated,
    guidText,
    relId: `rIdFontLato${variant[0]!.toUpperCase()}${variant.slice(1)}`,
  };
}

function ensureContentTypeOverride(contentTypesXml: string, parts: PreparedFontPart[]): string {
  let out = contentTypesXml;

  // Drop any stale `<Override ... .odttf ... />` entries left behind by a prior
  // strip pass (the strip regex in docx-tools.ts has a known bug that leaves
  // these behind). Anchored on `.odttf"` so only font overrides are removed.
  out = out.replace(/<Override\s+PartName="[^"]*\.odttf"[^>]*\/>/g, '');

  for (const part of parts) {
    const partPath = `/${part.partName}`;
    if (!out.includes(`PartName="${partPath}"`)) {
      const override = `<Override PartName="${partPath}" ContentType="application/vnd.openxmlformats-officedocument.obfuscatedFont"/>`;
      out = out.replace(/<\/Types>\s*$/, `${override}</Types>`);
    }
  }
  return out;
}

function buildFontTableRels(parts: PreparedFontPart[]): string {
  const rels = parts
    .map(
      (p) =>
        `<Relationship Id="${p.relId}" Type="${R_NS}/font" Target="fonts/${p.partName.split('/').pop()}"/>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${REL_NS}">${rels}</Relationships>`;
}

/**
 * Build or upsert a `<w:font w:name="Lato">` block with embed* children.
 *
 * If fontTable.xml already has a Lato entry, replace it. Otherwise append.
 */
function upsertLatoFontEntry(fontTableXml: string, parts: PreparedFontPart[]): string {
  const embedChildren = parts
    .map(
      (p) =>
        `<${VARIANT_EMBED_TAG[p.variant]} r:id="${p.relId}" w:fontKey="${p.guidText}"/>`,
    )
    .join('');

  const latoBlock =
    `<w:font w:name="Lato">` +
    `<w:panose1 w:val="020F0502020204030204"/>` +
    `<w:charset w:val="00"/>` +
    `<w:family w:val="swiss"/>` +
    `<w:pitch w:val="variable"/>` +
    `<w:sig w:usb0="E00002FF" w:usb1="4000ACFF" w:usb2="00000001" w:usb3="00000000" w:csb0="0000019F" w:csb1="00000000"/>` +
    embedChildren +
    `</w:font>`;

  // Remove any existing Lato entry (defensive, in case of repacks).
  const existingLato = /<w:font w:name="Lato">[\s\S]*?<\/w:font>/;
  if (existingLato.test(fontTableXml)) {
    return fontTableXml.replace(existingLato, latoBlock);
  }

  // Ensure xmlns:r is declared (some generators omit it on <w:fonts>).
  let out = fontTableXml;
  if (!out.includes('xmlns:r="')) {
    out = out.replace(/<w:fonts\b/, `<w:fonts xmlns:r="${R_NS}"`);
  }

  return out.replace(/<\/w:fonts>\s*$/, `${latoBlock}</w:fonts>`);
}

function ensureEmbedTrueTypeFonts(settingsXml: string): string {
  if (/<w:embedTrueTypeFonts\s*\/>/.test(settingsXml)) {
    return settingsXml;
  }
  // Insert right after the opening <w:settings ...> tag.
  return settingsXml.replace(/(<w:settings\b[^>]*>)/, `$1<w:embedTrueTypeFonts/>`);
}

/**
 * Default fontTable.xml skeleton if the base docx somehow lacks one.
 */
function emptyFontTable(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<w:fonts xmlns:w="${W_NS}" xmlns:r="${R_NS}"></w:fonts>`
  );
}

/**
 * Default settings.xml skeleton if missing (extremely unlikely for a real docx).
 */
function emptySettings(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<w:settings xmlns:w="${W_NS}"></w:settings>`
  );
}

/**
 * Embed the Lato font family (Regular/Bold/Italic/BoldItalic) into a packed
 * .docx file on disk. Rewrites the zip in place.
 */
export async function embedLatoFonts(docxPath: string, source: LatoFontSource): Promise<void> {
  const zipBuf = await readFile(docxPath);
  const zip = await JSZip.loadAsync(zipBuf);

  const parts: PreparedFontPart[] = [
    await prepareFontPart('regular', source.regular),
    await prepareFontPart('bold', source.bold),
    await prepareFontPart('italic', source.italic),
    await prepareFontPart('boldItalic', source.boldItalic),
  ];

  // 1) Add .odttf parts
  for (const p of parts) {
    zip.file(p.partName, p.bytes);
  }

  // 2) Patch [Content_Types].xml
  const ctFile = zip.file('[Content_Types].xml');
  if (!ctFile) {
    throw new Error('[Content_Types].xml missing from docx — cannot embed fonts');
  }
  const ctXml = await ctFile.async('string');
  zip.file('[Content_Types].xml', ensureContentTypeOverride(ctXml, parts));

  // 3) Patch word/fontTable.xml
  const ftFile = zip.file('word/fontTable.xml');
  const ftXml = ftFile ? await ftFile.async('string') : emptyFontTable();
  zip.file('word/fontTable.xml', upsertLatoFontEntry(ftXml, parts));

  // 4) Patch word/_rels/fontTable.xml.rels (merge, don't clobber)
  const ftRelsFile = zip.file('word/_rels/fontTable.xml.rels');
  const existingRels = ftRelsFile ? await ftRelsFile.async('string') : '';
  const mergedRels = mergeFontTableRels(existingRels, parts);
  zip.file('word/_rels/fontTable.xml.rels', mergedRels);

  // 5) Patch word/settings.xml
  const setFile = zip.file('word/settings.xml');
  const setXml = setFile ? await setFile.async('string') : emptySettings();
  zip.file('word/settings.xml', ensureEmbedTrueTypeFonts(setXml));

  // Write back.
  const out = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(docxPath, out);
}

function mergeFontTableRels(existing: string, parts: PreparedFontPart[]): string {
  const newRels = parts.map(
    (p) =>
      `<Relationship Id="${p.relId}" Type="${R_NS}/font" Target="fonts/${p.partName.split('/').pop()}"/>`,
  );

  if (!existing.trim()) {
    return buildFontTableRels(parts);
  }

  // Remove any prior Lato relationships so repacks stay idempotent.
  let cleaned = existing;
  for (const p of parts) {
    const re = new RegExp(`<Relationship[^>]*Id="${p.relId}"[^/]*/>`, 'g');
    cleaned = cleaned.replace(re, '');
  }

  // Case 1: empty self-closed <Relationships .../> produced by the stripper.
  const selfClosed = /<Relationships\b([^>]*)\/>/;
  if (selfClosed.test(cleaned)) {
    return cleaned.replace(selfClosed, `<Relationships$1>${newRels.join('')}</Relationships>`);
  }

  // Case 2: normal <Relationships>...</Relationships> wrapper.
  if (/<\/Relationships>\s*$/.test(cleaned)) {
    return cleaned.replace(/<\/Relationships>\s*$/, `${newRels.join('')}</Relationships>`);
  }

  // Fallback: rebuild from scratch.
  return buildFontTableRels(parts);
}

/**
 * Convenience: resolve the font source from the repo-standard path
 * `api/assets/fonts/lato/`.
 */
export function defaultLatoSource(apiRoot: string): LatoFontSource {
  const base = join(apiRoot, 'assets', 'fonts', 'lato');
  return {
    regular: join(base, 'Lato-Regular.ttf'),
    bold: join(base, 'Lato-Bold.ttf'),
    italic: join(base, 'Lato-Italic.ttf'),
    boldItalic: join(base, 'Lato-BoldItalic.ttf'),
  };
}
