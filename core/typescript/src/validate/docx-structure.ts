import { extractTextFromDocxBuffer } from '../docx/reader.js';

export interface DocxStructureValidation {
  /** Labels declared in `requiredSectionLabels` that are NOT present in the rendered DOCX text. */
  missing: string[];
  /** Labels that ARE present. */
  found: string[];
}

/**
 * Check that each required section label appears in the text of the DOCX.
 *
 * Match is case-insensitive substring on the extracted text. The DOCX is
 * parsed in-memory via the existing core docx reader (no temp files), so
 * this is safe to call from the api orchestrator on the in-memory DOCX
 * bytes produced by `transpose()`.
 *
 * Empty / falsy entries in `requiredSectionLabels` are skipped silently —
 * callers can pass a manifest's section labels without pre-filtering.
 */
export async function validateDocxStructure(
  docxBytes: Uint8Array,
  requiredSectionLabels: string[],
): Promise<DocxStructureValidation> {
  const text = await extractTextFromDocxBuffer(Buffer.from(docxBytes));
  const upper = text.toUpperCase();
  const missing: string[] = [];
  const found: string[] = [];
  for (const label of requiredSectionLabels) {
    if (!label) continue;
    if (upper.includes(label.toUpperCase())) {
      found.push(label);
    } else {
      missing.push(label);
    }
  }
  return { missing, found };
}
