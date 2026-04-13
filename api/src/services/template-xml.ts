import { readFile, writeFile } from 'node:fs/promises';
import type { CvData } from './cv-agent.js';
import type { TemplateContract, TemplateSectionKey } from './template-contract.js';

function pid(): string {
  const n = Math.floor(Math.random() * (0x4fffffff - 0x40000000 + 1)) + 0x40000000;
  return n.toString(16).toUpperCase().padStart(8, '0');
}

const PR = 'w:rsidR="00035852" w:rsidRDefault="001652D9"';
const PR0 = 'w:rsidR="00035852" w:rsidRDefault="00035852"';
const BDR =
  '<w:pBdr><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:between w:val="nil"/></w:pBdr>';
const EXPERIENCE_SECTION_KEYS: TemplateSectionKey[] = ['experience', 'selectedExperience', 'additionalExperience'];

interface ResolvedTemplateStyle {
  headingFont: string;
  bodyFont: string;
  accentColor: string;
  sectionBannerFill: string;
  sectionBannerText: string;
  bodyText: string;
  sectionBeforeTwip: number;
  sectionAfterTwip: number;
  lineTwip: number;
}

interface JobEntryOptions {
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

function normalizeColor(value: string | number | undefined, fallback: string): string {
  if (typeof value === 'number') {
    return value.toString(16).toUpperCase().padStart(6, '0');
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().replace(/^#/, '').toUpperCase();
  return /^[0-9A-F]{6}$/.test(normalized) ? normalized : fallback;
}

function readTokenNumber(value: string | number | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function readTokenString(value: string | number | undefined, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

function resolveVariantSpacing(contract: TemplateContract) {
  const baseBefore = readTokenNumber(contract.styleTokens.spacing.sectionBeforeTwip, 240);
  const baseAfter = readTokenNumber(contract.styleTokens.spacing.sectionAfterTwip, 240);
  const baseLine = readTokenNumber(contract.styleTokens.spacing.lineTwip, 300);

  switch (contract.layout.variant) {
    case 'executive-modern':
      return { sectionBeforeTwip: baseBefore + 80, sectionAfterTwip: baseAfter + 40, lineTwip: baseLine + 20 };
    case 'professional-compact':
      return { sectionBeforeTwip: Math.max(120, baseBefore - 60), sectionAfterTwip: Math.max(120, baseAfter - 80), lineTwip: Math.max(260, baseLine - 20) };
    case 'consulting-classic':
    case 'brand-accent':
      return { sectionBeforeTwip: baseBefore + 20, sectionAfterTwip: baseAfter, lineTwip: baseLine };
    case 'ats-core':
    default:
      return { sectionBeforeTwip: baseBefore, sectionAfterTwip: baseAfter, lineTwip: baseLine };
  }
}

function resolveTemplateStyle(contract: TemplateContract): ResolvedTemplateStyle {
  const spacing = resolveVariantSpacing(contract);
  const baseStyle: ResolvedTemplateStyle = {
    headingFont: readTokenString(contract.styleTokens.fonts.heading, 'Cambria'),
    bodyFont: readTokenString(contract.styleTokens.fonts.body, 'Cambria'),
    accentColor: normalizeColor(contract.styleTokens.colors.accent, '7030A0'),
    sectionBannerFill: normalizeColor(contract.styleTokens.colors.sectionBannerFill, 'E6E6E6'),
    sectionBannerText: normalizeColor(contract.styleTokens.colors.sectionBannerText, '7030A0'),
    bodyText: normalizeColor(contract.styleTokens.colors.bodyText, '000000'),
    sectionBeforeTwip: spacing.sectionBeforeTwip,
    sectionAfterTwip: spacing.sectionAfterTwip,
    lineTwip: spacing.lineTwip,
  };

  switch (contract.layout.variant) {
    case 'executive-modern':
      return {
        ...baseStyle,
        sectionBannerFill: baseStyle.accentColor,
        sectionBannerText: 'FFFFFF',
      };
    case 'brand-accent':
      return {
        ...baseStyle,
        sectionBannerFill: baseStyle.accentColor,
        sectionBannerText: 'FFFFFF',
      };
    case 'professional-compact':
      return {
        ...baseStyle,
        sectionBannerFill: 'F7FAFC',
        sectionBannerText: baseStyle.accentColor,
      };
    case 'consulting-classic':
      return {
        ...baseStyle,
        sectionBannerFill: normalizeColor(contract.styleTokens.colors.sectionBannerFill, 'E6E6E6'),
        sectionBannerText: normalizeColor(contract.styleTokens.colors.sectionBannerText, baseStyle.accentColor),
      };
    case 'ats-core':
    default:
      return baseStyle;
  }
}

function fontRun(font: string): string {
  return `<w:rFonts w:ascii="${font}" w:eastAsia="${font}" w:hAnsi="${font}" w:cs="${font}"/>`;
}

function sectionHeader(title: string, style: ResolvedTemplateStyle): string {
  const font = fontRun(style.headingFont);
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>` +
    `<w:shd w:val="clear" w:color="auto" w:fill="${style.sectionBannerFill}"/>` +
    `<w:spacing w:before="${style.sectionBeforeTwip}" w:after="${style.sectionAfterTwip}" w:line="${style.lineTwip}" w:lineRule="auto"/>` +
    `<w:jc w:val="center"/>` +
    `<w:rPr>${font}<w:b/><w:bCs/><w:smallCaps/><w:color w:val="${style.sectionBannerText}"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${font}<w:b/><w:bCs/><w:smallCaps/><w:color w:val="${style.sectionBannerText}"/></w:rPr>` +
    `<w:t>${title}</w:t></w:r></w:p>`
  );
}

function workSectionHeader(title: string, style: ResolvedTemplateStyle): string {
  const font = fontRun(style.headingFont);
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
    `<w:shd w:val="clear" w:color="auto" w:fill="${style.sectionBannerFill}"/>` +
    `<w:tabs><w:tab w:val="left" w:pos="1620"/><w:tab w:val="center" w:pos="5058"/></w:tabs>` +
    `<w:spacing w:before="${style.sectionBeforeTwip}"/>` +
    `<w:rPr>${font}<w:b/><w:bCs/><w:smallCaps/><w:color w:val="${style.sectionBannerText}"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${font}<w:b/><w:bCs/><w:smallCaps/><w:color w:val="${style.sectionBannerText}"/></w:rPr>` +
    `<w:tab/><w:tab/><w:t>${title}</w:t></w:r></w:p>`
  );
}

function skillBullet(label: string, description: string, style: ResolvedTemplateStyle): string {
  const bodyFont = fontRun(style.bodyFont);
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>` +
    `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr>` +
    `<w:tabs><w:tab w:val="left" w:pos="539"/></w:tabs>` +
    `<w:spacing w:line="${style.lineTwip}" w:lineRule="auto"/>` +
    `<w:rPr>${bodyFont}<w:color w:val="${style.bodyText}" w:themeColor="text1"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${bodyFont}<w:b/><w:bCs/><w:color w:val="${style.accentColor}"/></w:rPr>` +
    `<w:t>${label}</w:t></w:r>` +
    `<w:r><w:rPr>${bodyFont}<w:color w:val="${style.accentColor}"/></w:rPr>` +
    `<w:t xml:space="preserve"> </w:t></w:r>` +
    `<w:r><w:rPr>${bodyFont}<w:color w:val="${style.bodyText}" w:themeColor="text1"/></w:rPr>` +
    `<w:t>${description}</w:t></w:r></w:p>`
  );
}

function sectorCategory(label: string, style: ResolvedTemplateStyle): string {
  const bodyFont = fontRun(style.bodyFont);
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>` +
    `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr>` +
    `${BDR}` +
    `<w:tabs><w:tab w:val="left" w:pos="539"/></w:tabs>` +
    `<w:spacing w:line="${style.lineTwip}" w:lineRule="auto"/>` +
    `<w:ind w:left="709" w:hanging="425"/>` +
    `<w:rPr>${bodyFont}<w:color w:val="${style.accentColor}"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${bodyFont}<w:color w:val="${style.accentColor}"/></w:rPr>` +
    `<w:t>${label}</w:t></w:r></w:p>`
  );
}

function sectorItem(text: string, style: ResolvedTemplateStyle, pageBreak = false): string {
  const bodyFont = fontRun(style.bodyFont);
  const pb = pageBreak ? '<w:r><w:br w:type="page"/></w:r>' : '';
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>` +
    `<w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr>` +
    `<w:tabs><w:tab w:val="left" w:pos="539"/></w:tabs>` +
    `<w:spacing w:line="${style.lineTwip}" w:lineRule="auto"/>` +
    `<w:jc w:val="both"/>` +
    `<w:rPr>${bodyFont}</w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${bodyFont}</w:rPr><w:t>${text}</w:t></w:r>${pb}</w:p>`
  );
}

function spacer(style: ResolvedTemplateStyle): string {
  const bodyFont = fontRun(style.bodyFont);
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR0}>` +
    `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
    `<w:spacing w:line="${style.lineTwip}" w:lineRule="auto"/>` +
    `<w:jc w:val="both"/>` +
    `<w:rPr>${bodyFont}</w:rPr></w:pPr></w:p>`
  );
}

function emptyPara(): string {
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR0}>` +
    `<w:pPr><w:tabs><w:tab w:val="left" w:pos="1620"/><w:tab w:val="center" w:pos="5058"/></w:tabs></w:pPr></w:p>`
  );
}

function jobCompany(text: string, style: ResolvedTemplateStyle): string {
  const bodyFont = fontRun(style.bodyFont);
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
    `<w:spacing w:line="${style.lineTwip}" w:lineRule="auto"/><w:jc w:val="both"/>` +
    `<w:rPr>${bodyFont}<w:b/><w:bCs/><w:i/><w:iCs/><w:color w:val="${style.accentColor}"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${bodyFont}<w:b/><w:bCs/><w:i/><w:iCs/><w:color w:val="${style.accentColor}"/></w:rPr>` +
    `<w:t>${text}</w:t></w:r></w:p>`
  );
}

function jobDescription(text: string, style: ResolvedTemplateStyle): string {
  const bodyFont = fontRun(style.bodyFont);
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
    `<w:spacing w:line="${style.lineTwip}" w:lineRule="auto"/><w:jc w:val="both"/>` +
    `<w:rPr>${bodyFont}<w:b/><w:bCs/><w:i/><w:iCs/><w:color w:val="${style.accentColor}">` +
    `<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${bodyFont}<w:b/><w:bCs/><w:i/><w:iCs/><w:color w:val="${style.accentColor}">` +
    `<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>` +
    `<w:t>${text}</w:t></w:r></w:p>`
  );
}

function jobDates(text: string, style: ResolvedTemplateStyle): string {
  const bodyFont = fontRun(style.bodyFont);
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
    `<w:spacing w:line="${style.lineTwip}" w:lineRule="auto"/><w:jc w:val="both"/>` +
    `<w:rPr>${bodyFont}<w:b/><w:bCs/><w:i/><w:iCs/><w:color w:val="${style.accentColor}">` +
    `<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${bodyFont}<w:b/><w:bCs/><w:i/><w:iCs/><w:color w:val="${style.accentColor}">` +
    `<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>` +
    `<w:t>${text}</w:t></w:r></w:p>`
  );
}

function jobTitle(text: string, style: ResolvedTemplateStyle): string {
  const bodyFont = fontRun(style.bodyFont);
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
    `<w:spacing w:line="${style.lineTwip}" w:lineRule="auto"/><w:jc w:val="both"/>` +
    `<w:rPr>${bodyFont}<w:b/><w:bCs/><w:color w:val="${style.accentColor}"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${bodyFont}<w:b/><w:bCs/><w:color w:val="${style.accentColor}"/></w:rPr>` +
    `<w:t>${text}</w:t></w:r></w:p>`
  );
}

function labelPara(text: string, style: ResolvedTemplateStyle): string {
  const bodyFont = fontRun(style.bodyFont);
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
    `<w:ind w:right="-57"/>` +
    `<w:rPr>${bodyFont}<w:color w:val="${style.bodyText}"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${bodyFont}<w:b/><w:bCs/><w:color w:val="${style.bodyText}"/></w:rPr>` +
    `<w:t>${text}</w:t></w:r></w:p>`
  );
}

function bulletItem(text: string, style: ResolvedTemplateStyle): string {
  const bodyFont = fontRun(style.bodyFont);
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>` +
    `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>` +
    `${BDR}` +
    `<w:ind w:right="-57"/>` +
    `<w:rPr>${bodyFont}<w:color w:val="${style.bodyText}"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${bodyFont}<w:color w:val="${style.bodyText}"/></w:rPr>` +
    `<w:t>${text}</w:t></w:r></w:p>`
  );
}

function techEnvPara(label: string, text: string, style: ResolvedTemplateStyle): string {
  const bodyFont = fontRun(style.bodyFont);
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
    `<w:spacing w:line="${style.lineTwip}" w:lineRule="auto"/>` +
    `<w:ind w:right="-57"/>` +
    `<w:rPr>${bodyFont}<w:color w:val="${style.bodyText}"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${bodyFont}<w:b/><w:bCs/><w:color w:val="${style.bodyText}"/></w:rPr>` +
    `<w:t>${label}</w:t></w:r>` +
    `<w:r><w:rPr>${bodyFont}<w:color w:val="${style.bodyText}"/></w:rPr>` +
    `<w:t xml:space="preserve"> ${text}</w:t></w:r></w:p>`
  );
}

function educationLine(year: string, text: string, style: ResolvedTemplateStyle): string {
  const bodyFont = fontRun(style.bodyFont);
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>` +
    `<w:tabs><w:tab w:val="left" w:pos="1276"/></w:tabs>` +
    `<w:spacing w:before="120" w:after="120" w:line="${style.lineTwip}" w:lineRule="auto"/>` +
    `<w:ind w:left="1270" w:hanging="1270"/>` +
    `<w:rPr>${bodyFont}</w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${bodyFont}</w:rPr>` +
    `<w:t>${year}</w:t><w:tab/><w:t>${text}</w:t></w:r></w:p>`
  );
}

function jobEntry(opts: JobEntryOptions, style: ResolvedTemplateStyle): string[] {
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
    jobCompany(company, style),
    jobDescription(description, style),
    jobDates(dates, style),
    spacer(style),
    jobTitle(title, style),
    spacer(style),
    labelPara(tasksLabel, style),
  ];

  for (const task of tasks) {
    parts.push(bulletItem(task, style));
  }

  if (achievements.length > 0) {
    parts.push(labelPara(achievementsLabel, style));
    for (const achievement of achievements) {
      parts.push(bulletItem(achievement, style));
    }
  }

  parts.push(techEnvPara(techLabel, techEnvironment, style));
  parts.push(spacer(style));
  return parts;
}

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

function getSection(contract: TemplateContract, key: TemplateSectionKey) {
  return contract.sections.find((section) => section.key === key);
}

function renderSkillsSection(
  section: { label: string },
  items: CvData['technicalSkills'],
  style: ResolvedTemplateStyle,
): string[] {
  if (items.length === 0) {
    return [];
  }

  return [
    sectionHeader(section.label, style),
    ...items.slice(0, 7).map((skill) => skillBullet(skill.label, skill.description, style)),
  ];
}

function renderSectorSection(
  section: { label: string },
  sectors: string[],
  domains: string[],
  style: ResolvedTemplateStyle,
  addPageBreak: boolean,
): string[] {
  if (sectors.length === 0 && domains.length === 0) {
    return [];
  }

  const paragraphs: string[] = [sectionHeader(section.label, style)];
  const items: Array<{ label: string; values: string[] }> = [];
  if (sectors.length > 0) {
    items.push({ label: 'Sectors', values: sectors });
  }
  if (domains.length > 0) {
    items.push({ label: 'Domains', values: domains });
  }

  items.forEach((group, groupIndex) => {
    paragraphs.push(sectorCategory(group.label, style));
    group.values.forEach((value, valueIndex) => {
      const isLastGroup = groupIndex === items.length - 1;
      const isLastValue = valueIndex === group.values.length - 1;
      paragraphs.push(sectorItem(value, style, addPageBreak && isLastGroup && isLastValue));
    });
  });

  return paragraphs;
}

function renderExperienceSection(
  section: { key: TemplateSectionKey; label: string },
  jobs: CvData['experience'],
  style: ResolvedTemplateStyle,
): string[] {
  if (jobs.length === 0) {
    return [];
  }

  const paragraphs: string[] = [workSectionHeader(section.label, style), emptyPara()];
  jobs.forEach((job) => {
    paragraphs.push(...jobEntry({
      company: job.company,
      description: job.description,
      dates: job.dates,
      title: job.title,
      tasks: job.tasks,
      achievements: job.achievements,
      techEnvironment: job.techEnvironment,
    }, style));
  });
  return paragraphs;
}

function renderLanguagesSection(
  section: { label: string },
  languages: CvData['languages'],
  style: ResolvedTemplateStyle,
): string[] {
  if (languages.length === 0) {
    return [];
  }

  return [
    sectionHeader(section.label, style),
    ...languages.map((language) => skillBullet(language.label, language.level, style)),
  ];
}

function renderEducationSection(
  section: { label: string },
  education: CvData['education'],
  style: ResolvedTemplateStyle,
): string[] {
  if (education.length === 0) {
    return [];
  }

  return [
    sectionHeader(section.label, style),
    ...education.map((entry) => educationLine(entry.year, entry.description, style)),
  ];
}

function assertSupportedRequiredSections(contract: TemplateContract): void {
  const supported = new Set<TemplateSectionKey>([
    'technicalSkills',
    'coreSkills',
    'sectorSkills',
    'sectorExperience',
    'experience',
    'selectedExperience',
    'additionalExperience',
    'languages',
    'education',
  ]);

  for (const section of contract.sections) {
    if (section.required && !supported.has(section.key)) {
      throw new Error(`Unsupported required template section: ${section.key}`);
    }
  }
}

export async function getXmlHeader(templateDocumentXmlPath: string): Promise<string> {
  const content = await readFile(templateDocumentXmlPath, 'utf-8');
  const idx = content.indexOf('<w:body>');
  if (idx === -1) throw new Error('Could not find <w:body> in template document.xml');
  return content.slice(0, idx) + '<w:body>\n';
}

export function buildTemplateDocumentXml(data: CvData, contract: TemplateContract, xmlHeader: string): string {
  assertSupportedRequiredSections(contract);
  const style = resolveTemplateStyle(contract);
  const paragraphs: string[] = [];
  const selectedJobs = data.experience.slice(0, 3);
  const additionalJobs = data.experience.slice(3);

  contract.sections.forEach((section, index) => {
    const nextHasExperience = contract.sections.slice(index + 1).some((candidate) => EXPERIENCE_SECTION_KEYS.includes(candidate.key));

    switch (section.key) {
      case 'technicalSkills':
      case 'coreSkills':
        paragraphs.push(...renderSkillsSection(section, data.technicalSkills, style));
        break;
      case 'sectorSkills':
      case 'sectorExperience':
        paragraphs.push(...renderSectorSection(section, data.sectors, data.domains, style, nextHasExperience));
        break;
      case 'experience':
        paragraphs.push(...renderExperienceSection(section, data.experience, style));
        break;
      case 'selectedExperience':
        paragraphs.push(...renderExperienceSection(section, selectedJobs, style));
        break;
      case 'additionalExperience':
        paragraphs.push(...renderExperienceSection(section, additionalJobs, style));
        break;
      case 'languages':
        paragraphs.push(...renderLanguagesSection(section, data.languages, style));
        break;
      case 'education':
        paragraphs.push(...renderEducationSection(section, data.education, style));
        break;
      case 'executiveSummary':
      case 'tools':
        if (section.required) {
          throw new Error(`Template section ${section.key} is required but has no renderer yet`);
        }
        break;
      default: {
        const exhaustiveCheck: never = section.key;
        throw new Error(`Unhandled template section: ${exhaustiveCheck}`);
      }
    }
  });

  return xmlHeader + paragraphs.join('\n') + '\n' + SECT_PR;
}

export async function updateTemplateHeader(
  headerPath: string,
  data: Pick<CvData, 'name' | 'title_line1' | 'title_line2' | 'years'>,
): Promise<void> {
  let xml = await readFile(headerPath, 'utf-8');
  const headline = [data.title_line1, data.title_line2].filter(Boolean).join(' ').trim();
  const yearsLine = data.years ? `${data.years} years of experience` : '';
  const textMatches = [...xml.matchAll(/<w:t[^>]*>(.*?)<\/w:t>/g)];

  if (textMatches.length >= 4) {
    const replacements = [data.name, data.title_line1, data.title_line2, data.years];
    replacements.forEach((value, index) => {
      const current = textMatches[index]?.[1];
      if (current !== undefined) {
        xml = xml.replace(textMatches[index][0], textMatches[index][0].replace(current, value));
      }
    });
  } else if (textMatches.length >= 3) {
    const replacements = [data.name, headline, yearsLine];
    replacements.forEach((value, index) => {
      const current = textMatches[index]?.[1];
      if (current !== undefined) {
        xml = xml.replace(textMatches[index][0], textMatches[index][0].replace(current, value));
      }
    });
  }

  await writeFile(headerPath, xml, 'utf-8');
}
