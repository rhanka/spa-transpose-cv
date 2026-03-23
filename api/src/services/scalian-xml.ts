/**
 * scalian-xml.ts — Scalian CV Template XML Building Blocks
 *
 * TypeScript port of scalian_xml.py. Produces raw OOXML paragraphs that
 * exactly replicate the Scalian CV template formatting (Cambria font,
 * purple #7030A0 headings, gray section banners, numbered/bulleted lists).
 *
 * Usage:
 *   import { sectionHeader, skillBullet, assembleDocument, ... } from './scalian-xml.ts';
 *
 *   const P: string[] = [];
 *   P.push(sectionHeader("Technical SKILLS"));
 *   P.push(skillBullet("Cloud:", "AWS, Azure, GCP (>5y)"));
 *   ...
 *   const xml = assembleDocument(P, xmlHeader);
 */

import { readFile, writeFile } from 'node:fs/promises';

// ── helpers ──────────────────────────────────────────────────────────────────

function pid(): string {
  const n = Math.floor(Math.random() * (0x4fffffff - 0x40000000 + 1)) + 0x40000000;
  return n.toString(16).toUpperCase().padStart(8, '0');
}

const F = '<w:rFonts w:ascii="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria" w:cs="Cambria"/>';
const PR = 'w:rsidR="00035852" w:rsidRDefault="001652D9"';
const PR0 = 'w:rsidR="00035852" w:rsidRDefault="00035852"';
const BDR =
  '<w:pBdr><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:between w:val="nil"/></w:pBdr>';

// ── SECTION HEADERS ──────────────────────────────────────────────────────────
// Gray background (#E6E6E6), centered, bold small-caps purple text

/** Main section divider: TECHNICAL SKILLS, SECTOR-SPECIFIC SKILLS, WORK EXPERIENCE, LANGUAGES, EDUCATION. */
export function sectionHeader(title: string): string {
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>` +
    `<w:shd w:val="clear" w:color="auto" w:fill="E6E6E6"/>` +
    `<w:spacing w:before="240" w:after="240" w:line="300" w:lineRule="auto"/>` +
    `<w:jc w:val="center"/>` +
    `<w:rPr>${F}<w:b/><w:bCs/><w:smallCaps/><w:color w:val="7030A0"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${F}<w:b/><w:bCs/><w:smallCaps/><w:color w:val="7030A0"/></w:rPr>` +
    `<w:t>${title}</w:t></w:r></w:p>`
  );
}

/** Centered gray header with leading tabs (used for WORK EXPERIENCE). */
export function workSectionHeader(title: string): string {
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
    `<w:shd w:val="clear" w:color="auto" w:fill="E6E6E6"/>` +
    `<w:tabs><w:tab w:val="left" w:pos="1620"/><w:tab w:val="center" w:pos="5058"/></w:tabs>` +
    `<w:spacing w:before="240"/>` +
    `<w:rPr>${F}<w:b/><w:bCs/><w:smallCaps/><w:color w:val="7030A0"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${F}<w:b/><w:bCs/><w:smallCaps/><w:color w:val="7030A0"/></w:rPr>` +
    `<w:tab/><w:tab/><w:t>${title}</w:t></w:r></w:p>`
  );
}

// ── TECHNICAL SKILLS bullets ─────────────────────────────────────────────────
// Purple bold label + space + black description, in list numId=3

/** One skill line: **Label:** Description — in the numbered list. */
export function skillBullet(label: string, description: string): string {
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>` +
    `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr>` +
    `<w:tabs><w:tab w:val="left" w:pos="539"/></w:tabs>` +
    `<w:spacing w:line="300" w:lineRule="auto"/>` +
    `<w:rPr>${F}<w:color w:val="000000" w:themeColor="text1"/></w:rPr>` +
    `</w:pPr>` +
    // bold purple label
    `<w:r><w:rPr>${F}<w:b/><w:bCs/><w:color w:val="7030A0"/></w:rPr>` +
    `<w:t>${label}</w:t></w:r>` +
    // space
    `<w:r><w:rPr>${F}<w:color w:val="7030A0"/></w:rPr>` +
    `<w:t xml:space="preserve"> </w:t></w:r>` +
    // black description
    `<w:r><w:rPr>${F}<w:color w:val="000000" w:themeColor="text1"/></w:rPr>` +
    `<w:t>${description}</w:t></w:r></w:p>`
  );
}

// ── SECTOR-SPECIFIC SKILLS ───────────────────────────────────────────────────

/** Category label (e.g. "Sectors", "Domains") — purple, in list numId=3. */
export function sectorCategory(label: string): string {
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>` +
    `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr>` +
    `${BDR}` +
    `<w:tabs><w:tab w:val="left" w:pos="539"/></w:tabs>` +
    `<w:spacing w:line="300" w:lineRule="auto"/>` +
    `<w:ind w:left="709" w:hanging="425"/>` +
    `<w:rPr>${F}<w:color w:val="7030A0"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${F}<w:color w:val="7030A0"/></w:rPr>` +
    `<w:t>${label}</w:t></w:r></w:p>`
  );
}

/** Sub-bullet under Sectors or Domains — black, in list numId=1 level 1. */
export function sectorItem(text: string, pageBreak = false): string {
  const pb = pageBreak ? '<w:r><w:br w:type="page"/></w:r>' : '';
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>` +
    `<w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr>` +
    `<w:tabs><w:tab w:val="left" w:pos="539"/></w:tabs>` +
    `<w:spacing w:line="300" w:lineRule="auto"/>` +
    `<w:jc w:val="both"/>` +
    `<w:rPr>${F}</w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${F}</w:rPr><w:t>${text}</w:t></w:r>${pb}</w:p>`
  );
}

// ── SPACERS / EMPTY PARAGRAPHS ───────────────────────────────────────────────

/** Empty paragraph used between job sub-sections. */
export function spacer(): string {
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR0}>` +
    `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
    `<w:spacing w:line="300" w:lineRule="auto"/>` +
    `<w:jc w:val="both"/>` +
    `<w:rPr>${F}</w:rPr></w:pPr></w:p>`
  );
}

/** Empty paragraph after WORK EXPERIENCE header. */
export function emptyPara(): string {
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR0}>` +
    `<w:pPr><w:tabs><w:tab w:val="left" w:pos="1620"/>` +
    `<w:tab w:val="center" w:pos="5058"/></w:tabs></w:pPr></w:p>`
  );
}

// ── JOB ENTRY BUILDING BLOCKS ───────────────────────────────────────────────

/** Company line: bold italic purple (normal size). */
export function jobCompany(text: string): string {
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
    `<w:spacing w:line="300" w:lineRule="auto"/><w:jc w:val="both"/>` +
    `<w:rPr>${F}<w:b/><w:bCs/><w:i/><w:iCs/><w:color w:val="7030A0"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${F}<w:b/><w:bCs/><w:i/><w:iCs/><w:color w:val="7030A0"/></w:rPr>` +
    `<w:t>${text}</w:t></w:r></w:p>`
  );
}

/** Company/context description: bold italic purple, 11pt. */
export function jobDescription(text: string): string {
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
    `<w:spacing w:line="300" w:lineRule="auto"/><w:jc w:val="both"/>` +
    `<w:rPr>${F}<w:b/><w:bCs/><w:i/><w:iCs/><w:color w:val="7030A0"/>` +
    `<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${F}<w:b/><w:bCs/><w:i/><w:iCs/><w:color w:val="7030A0"/>` +
    `<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>` +
    `<w:t>${text}</w:t></w:r></w:p>`
  );
}

/** Date range: bold italic purple, 10pt. */
export function jobDates(text: string): string {
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
    `<w:spacing w:line="300" w:lineRule="auto"/><w:jc w:val="both"/>` +
    `<w:rPr>${F}<w:b/><w:bCs/><w:i/><w:iCs/><w:color w:val="7030A0"/>` +
    `<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${F}<w:b/><w:bCs/><w:i/><w:iCs/><w:color w:val="7030A0"/>` +
    `<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>` +
    `<w:t>${text}</w:t></w:r></w:p>`
  );
}

/** Job title: bold purple (not italic). */
export function jobTitle(text: string): string {
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
    `<w:spacing w:line="300" w:lineRule="auto"/><w:jc w:val="both"/>` +
    `<w:rPr>${F}<w:b/><w:bCs/><w:color w:val="7030A0"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${F}<w:b/><w:bCs/><w:color w:val="7030A0"/></w:rPr>` +
    `<w:t>${text}</w:t></w:r></w:p>`
  );
}

/** Sub-section label (Tasks: / Achievements:) — bold black. */
export function labelPara(text: string): string {
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
    `<w:ind w:right="-57"/>` +
    `<w:rPr>${F}<w:color w:val="000000"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${F}<w:b/><w:bCs/><w:color w:val="000000"/></w:rPr>` +
    `<w:t>${text}</w:t></w:r></w:p>`
  );
}

/** Bullet list item under Tasks/Achievements — black, numId=2. */
export function bulletItem(text: string): string {
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>` +
    `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>` +
    `${BDR}` +
    `<w:ind w:right="-57"/>` +
    `<w:rPr>${F}<w:color w:val="000000"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${F}<w:color w:val="000000"/></w:rPr>` +
    `<w:t>${text}</w:t></w:r></w:p>`
  );
}

/** Technical Environment: combined label (bold black) + content (regular black) in one paragraph. */
export function techEnvPara(label: string, text: string): string {
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
    `<w:spacing w:line="300" w:lineRule="auto"/>` +
    `<w:ind w:right="-57"/>` +
    `<w:rPr>${F}<w:color w:val="000000"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${F}<w:b/><w:bCs/><w:color w:val="000000"/></w:rPr>` +
    `<w:t>${label}</w:t></w:r>` +
    `<w:r><w:rPr>${F}<w:color w:val="000000"/></w:rPr>` +
    `<w:t xml:space="preserve"> ${text}</w:t></w:r></w:p>`
  );
}

// ── EDUCATION LINE ───────────────────────────────────────────────────────────

/** Education entry: year [tab] description. */
export function educationLine(year: string, text: string): string {
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>` +
    `<w:tabs><w:tab w:val="left" w:pos="1276"/></w:tabs>` +
    `<w:spacing w:before="120" w:after="120" w:line="300" w:lineRule="auto"/>` +
    `<w:ind w:left="1270" w:hanging="1270"/>` +
    `<w:rPr>${F}</w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${F}</w:rPr>` +
    `<w:t>${year}</w:t><w:tab/><w:t>${text}</w:t></w:r></w:p>`
  );
}

// ── COMPOSITE: full job entry ────────────────────────────────────────────────

export interface JobEntryOptions {
  company: string;
  description: string;
  dates: string;
  title: string;
  tasks: string[];
  achievements: string[];
  techEnvironment: string;
  tasksLabel?: string;
  achievementsLabel?: string;
  techLabel?: string;
}

/**
 * Build a complete job block. Returns a list of XML paragraph strings.
 *
 * For French CVs, pass:
 *   tasksLabel: "T&#xE2;ches :",
 *   achievementsLabel: "R&#xE9;alisations :",
 *   techLabel: "Environnement technique :"
 */
export function jobEntry(opts: JobEntryOptions): string[] {
  const {
    company,
    description,
    dates,
    title,
    tasks,
    achievements,
    techEnvironment,
    tasksLabel = 'Tasks:',
    achievementsLabel = 'Achievements:',
    techLabel = 'Technical Environment:',
  } = opts;

  const parts: string[] = [
    jobCompany(company),
    jobDescription(description),
    jobDates(dates),
    spacer(),
    jobTitle(title),
    spacer(),
    labelPara(tasksLabel),
  ];

  for (const t of tasks) {
    parts.push(bulletItem(t));
  }

  if (achievements.length > 0) {
    parts.push(labelPara(achievementsLabel));
    for (const a of achievements) {
      parts.push(bulletItem(a));
    }
  }

  parts.push(techEnvPara(techLabel, techEnvironment));
  parts.push(spacer()); // separator before next job entry
  return parts;
}

// ── ASSEMBLY ─────────────────────────────────────────────────────────────────

const SECT_PR = `    <w:sectPr w:rsidR="00035852" w:rsidRPr="00633E15">
      <w:headerReference w:type="even" r:id="rId7"/>
      <w:headerReference w:type="default" r:id="rId8"/>
      <w:footerReference w:type="default" r:id="rId9"/>
      <w:pgSz w:w="12242" w:h="15842"/>
      <w:pgMar w:top="83" w:right="992" w:bottom="567" w:left="1134" w:header="120" w:footer="555" w:gutter="0"/>
      <w:pgNumType w:start="1"/>
      <w:cols w:space="720"/>
    </w:sectPr>
  </w:body>
</w:document>`;

/** Extract the XML declaration + namespaces + <w:body> opening from the template. */
export async function getXmlHeader(templateDocumentXmlPath: string): Promise<string> {
  const content = await readFile(templateDocumentXmlPath, 'utf-8');
  const idx = content.indexOf('<w:body>');
  if (idx === -1) throw new Error('Could not find <w:body> in template document.xml');
  return content.slice(0, idx) + '<w:body>\n';
}

/** Combine xmlHeader + paragraphs + sectPr into a complete document.xml. */
export function assembleDocument(paragraphs: string[], xmlHeader: string): string {
  return xmlHeader + paragraphs.join('\n') + '\n' + SECT_PR;
}

/**
 * Update header2.xml with candidate info.
 *
 * The template has these text nodes that need replacing:
 *   "Fabien Antoine" -> name
 *   "CxO"            -> titleLine1
 *   "Advisor"        -> titleLine2
 *   "23"             -> years
 */
export async function updateHeader(
  header2Path: string,
  name: string,
  titleLine1: string,
  titleLine2: string,
  years: string,
): Promise<void> {
  let h = await readFile(header2Path, 'utf-8');
  h = h.replace('>Fabien Antoine<', `>${name}<`);
  h = h.replace('>CxO<', `>${titleLine1}<`);
  h = h.replace('> Advisor<', `> ${titleLine2}<`);
  h = h.replace('>Advisor<', `>${titleLine2}<`);
  h = h.replace('<w:t>23</w:t>', `<w:t>${years}</w:t>`);
  await writeFile(header2Path, h, 'utf-8');
}
