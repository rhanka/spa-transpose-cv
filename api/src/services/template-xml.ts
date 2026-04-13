import { readFile, writeFile } from 'node:fs/promises';
import type { CvData } from './cv-agent.js';
import type { TemplateContract, TemplateSectionKey } from './template-contract.js';
import { getTemplateVariantDefinition } from './template-variant-catalog.js';

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
  mutedText: string;
  headerStyle: ReturnType<typeof getTemplateVariantDefinition>['headerStyle'];
  sectionStyle: ReturnType<typeof getTemplateVariantDefinition>['sectionStyle'];
  jobStyle: ReturnType<typeof getTemplateVariantDefinition>['jobStyle'];
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
  return {
    sectionBeforeTwip: readTokenNumber(contract.styleTokens.spacing.sectionBeforeTwip, 240),
    sectionAfterTwip: readTokenNumber(contract.styleTokens.spacing.sectionAfterTwip, 240),
    lineTwip: readTokenNumber(contract.styleTokens.spacing.lineTwip, 300),
  };
}

function resolveTemplateStyle(contract: TemplateContract): ResolvedTemplateStyle {
  const spacing = resolveVariantSpacing(contract);
  const definition = getTemplateVariantDefinition(contract.layout.variant);

  return {
    headingFont: readTokenString(contract.styleTokens.fonts.heading, 'Cambria'),
    bodyFont: readTokenString(contract.styleTokens.fonts.body, 'Cambria'),
    accentColor: normalizeColor(contract.styleTokens.colors.accent, '7030A0'),
    sectionBannerFill: normalizeColor(contract.styleTokens.colors.sectionBannerFill, 'E6E6E6'),
    sectionBannerText: normalizeColor(contract.styleTokens.colors.sectionBannerText, '1F2937'),
    bodyText: normalizeColor(contract.styleTokens.colors.bodyText, '000000'),
    mutedText: normalizeColor(contract.styleTokens.colors.mutedText, '5B6470'),
    headerStyle: definition.headerStyle,
    sectionStyle: definition.sectionStyle,
    jobStyle: definition.jobStyle,
    sectionBeforeTwip: spacing.sectionBeforeTwip,
    sectionAfterTwip: spacing.sectionAfterTwip,
    lineTwip: spacing.lineTwip,
  };
}

function fontRun(font: string): string {
  return `<w:rFonts w:ascii="${font}" w:eastAsia="${font}" w:hAnsi="${font}" w:cs="${font}"/>`;
}

function sectionHeader(title: string, style: ResolvedTemplateStyle): string {
  const font = fontRun(style.headingFont);
  switch (style.sectionStyle) {
    case 'rule-caps':
      return (
        `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
        `<w:pPr><w:widowControl w:val="0"/>` +
        `<w:pBdr><w:bottom w:val="single" w:sz="10" w:space="1" w:color="${style.accentColor}"/></w:pBdr>` +
        `<w:spacing w:before="${style.sectionBeforeTwip}" w:after="${style.sectionAfterTwip}" w:line="${style.lineTwip}" w:lineRule="auto"/>` +
        `<w:jc w:val="left"/>` +
        `<w:rPr>${font}<w:b/><w:bCs/><w:caps/><w:color w:val="${style.sectionBannerText}"/></w:rPr>` +
        `</w:pPr>` +
        `<w:r><w:rPr>${font}<w:b/><w:bCs/><w:caps/><w:color w:val="${style.sectionBannerText}"/></w:rPr>` +
        `<w:t>${title}</w:t></w:r></w:p>`
      );
    case 'subtle-label':
      return (
        `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
        `<w:pPr><w:widowControl w:val="0"/>` +
        `<w:pBdr><w:top w:val="single" w:sz="6" w:space="1" w:color="${style.sectionBannerFill}"/></w:pBdr>` +
        `<w:spacing w:before="${style.sectionBeforeTwip}" w:after="${style.sectionAfterTwip}" w:line="${style.lineTwip}" w:lineRule="auto"/>` +
        `<w:jc w:val="left"/>` +
        `<w:rPr>${font}<w:b/><w:bCs/><w:smallCaps/><w:color w:val="${style.sectionBannerText}"/></w:rPr>` +
        `</w:pPr>` +
        `<w:r><w:rPr>${font}<w:b/><w:bCs/><w:smallCaps/><w:color w:val="${style.sectionBannerText}"/></w:rPr>` +
        `<w:t>${title}</w:t></w:r></w:p>`
      );
    case 'compact-rule':
      return (
        `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
        `<w:pPr><w:widowControl w:val="0"/>` +
        `<w:pBdr><w:top w:val="single" w:sz="4" w:space="1" w:color="${style.sectionBannerFill}"/></w:pBdr>` +
        `<w:spacing w:before="${style.sectionBeforeTwip}" w:after="${Math.max(40, style.sectionAfterTwip - 20)}" w:line="${style.lineTwip}" w:lineRule="auto"/>` +
        `<w:jc w:val="left"/>` +
        `<w:rPr>${font}<w:b/><w:bCs/><w:caps/><w:color w:val="${style.sectionBannerText}"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr>` +
        `</w:pPr>` +
        `<w:r><w:rPr>${font}<w:b/><w:bCs/><w:caps/><w:color w:val="${style.sectionBannerText}"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr>` +
        `<w:t>${title}</w:t></w:r></w:p>`
      );
    case 'filled-bar':
      return (
        `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
        `<w:pPr><w:widowControl w:val="0"/>` +
        `<w:shd w:val="clear" w:color="auto" w:fill="${style.accentColor}"/>` +
        `<w:spacing w:before="${style.sectionBeforeTwip}" w:after="${style.sectionAfterTwip}" w:line="${style.lineTwip}" w:lineRule="auto"/>` +
        `<w:jc w:val="center"/>` +
        `<w:rPr>${font}<w:b/><w:bCs/><w:smallCaps/><w:color w:val="FFFFFF"/></w:rPr>` +
        `</w:pPr>` +
        `<w:r><w:rPr>${font}<w:b/><w:bCs/><w:smallCaps/><w:color w:val="FFFFFF"/></w:rPr>` +
        `<w:t>${title}</w:t></w:r></w:p>`
      );
    case 'classic-band':
      return (
        `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
        `<w:pPr><w:widowControl w:val="0"/>` +
        `<w:shd w:val="clear" w:color="auto" w:fill="${style.sectionBannerFill}"/>` +
        `<w:spacing w:before="${style.sectionBeforeTwip}" w:after="${style.sectionAfterTwip}" w:line="${style.lineTwip}" w:lineRule="auto"/>` +
        `<w:jc w:val="left"/><w:ind w:left="120"/>` +
        `<w:rPr>${font}<w:b/><w:bCs/><w:smallCaps/><w:color w:val="${style.sectionBannerText}"/></w:rPr>` +
        `</w:pPr>` +
        `<w:r><w:rPr>${font}<w:b/><w:bCs/><w:smallCaps/><w:color w:val="${style.sectionBannerText}"/></w:rPr>` +
        `<w:t>${title}</w:t></w:r></w:p>`
      );
    case 'centered-rule':
      return (
        `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
        `<w:pPr><w:widowControl w:val="0"/>` +
        `<w:pBdr><w:top w:val="single" w:sz="6" w:space="6" w:color="${style.sectionBannerFill}"/><w:bottom w:val="single" w:sz="6" w:space="6" w:color="${style.sectionBannerFill}"/></w:pBdr>` +
        `<w:spacing w:before="${style.sectionBeforeTwip}" w:after="${style.sectionAfterTwip}" w:line="${style.lineTwip}" w:lineRule="auto"/>` +
        `<w:jc w:val="center"/>` +
        `<w:rPr>${font}<w:b/><w:bCs/><w:smallCaps/><w:color w:val="${style.sectionBannerText}"/></w:rPr>` +
        `</w:pPr>` +
        `<w:r><w:rPr>${font}<w:b/><w:bCs/><w:smallCaps/><w:color w:val="${style.sectionBannerText}"/></w:rPr>` +
        `<w:t>${title}</w:t></w:r></w:p>`
      );
    case 'left-accent':
    default:
      return (
        `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
        `<w:pPr><w:widowControl w:val="0"/>` +
        `<w:pBdr><w:left w:val="single" w:sz="16" w:space="6" w:color="${style.accentColor}"/></w:pBdr>` +
        `<w:spacing w:before="${style.sectionBeforeTwip}" w:after="${style.sectionAfterTwip}" w:line="${style.lineTwip}" w:lineRule="auto"/>` +
        `<w:ind w:left="120"/><w:jc w:val="left"/>` +
        `<w:rPr>${font}<w:b/><w:bCs/><w:caps/><w:color w:val="${style.sectionBannerText}"/></w:rPr>` +
        `</w:pPr>` +
        `<w:r><w:rPr>${font}<w:b/><w:bCs/><w:caps/><w:color w:val="${style.sectionBannerText}"/></w:rPr>` +
        `<w:t>${title}</w:t></w:r></w:p>`
      );
  }
}

function workSectionHeader(title: string, style: ResolvedTemplateStyle): string {
  return sectionHeader(title, style);
}

function skillBullet(label: string, description: string, style: ResolvedTemplateStyle): string {
  const bodyFont = fontRun(style.bodyFont);
  const labelColor = style.jobStyle === 'ats-plain' ? style.bodyText : style.accentColor;
  const compact = style.jobStyle === 'compact-dense';
  if (compact) {
    return (
      `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
      `<w:pPr><w:widowControl w:val="0"/>${BDR}<w:spacing w:after="6" w:line="${Math.max(220, style.lineTwip - 20)}" w:lineRule="auto"/>` +
      `<w:rPr>${bodyFont}<w:color w:val="${labelColor}"/><w:b/><w:bCs/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr></w:pPr>` +
      `<w:r><w:rPr>${bodyFont}<w:color w:val="${labelColor}"/><w:b/><w:bCs/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t>${label.replace(/:\s*$/, '')}</w:t></w:r>` +
      `</w:p>` +
      `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
      `<w:pPr><w:widowControl w:val="0"/>${BDR}<w:spacing w:after="34" w:line="${Math.max(220, style.lineTwip - 10)}" w:lineRule="auto"/>` +
      `<w:rPr>${bodyFont}<w:color w:val="${style.bodyText}"/><w:sz w:val="14"/><w:szCs w:val="14"/></w:rPr></w:pPr>` +
      `<w:r><w:rPr>${bodyFont}<w:color w:val="${style.bodyText}"/><w:sz w:val="14"/><w:szCs w:val="14"/></w:rPr><w:t>${description}</w:t></w:r>` +
      `</w:p>`
    );
  }

  const labelSize = compact ? 18 : 22;
  const textSize = compact ? 16 : 22;
  const lineTwip = compact ? Math.max(180, style.lineTwip - 80) : style.lineTwip;
  const indent = compact
    ? '<w:ind w:left="0"/>'
    : '<w:ind w:left="420" w:hanging="220"/>';
  const bulletRuns = compact
    ? ''
    : `<w:r><w:rPr>${bodyFont}<w:color w:val="${style.accentColor}"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t>•</w:t></w:r>` +
      `<w:r><w:rPr>${bodyFont}<w:color w:val="${style.bodyText}"/><w:sz w:val="${textSize}"/><w:szCs w:val="${textSize}"/></w:rPr><w:t xml:space="preserve"> </w:t></w:r>`;

  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>` +
    `${indent}` +
    `<w:spacing w:after="${compact ? 36 : 36}" w:line="${lineTwip}" w:lineRule="auto"/>` +
    `<w:rPr>${bodyFont}<w:color w:val="${style.bodyText}" w:themeColor="text1"/><w:sz w:val="${textSize}"/><w:szCs w:val="${textSize}"/></w:rPr>` +
    `</w:pPr>` +
    `${bulletRuns}` +
    `<w:r><w:rPr>${bodyFont}<w:b/><w:bCs/><w:color w:val="${labelColor}"/><w:sz w:val="${labelSize}"/><w:szCs w:val="${labelSize}"/></w:rPr>` +
    `<w:t>${label}</w:t></w:r>` +
    `<w:r><w:rPr>${bodyFont}<w:color w:val="${labelColor}"/><w:sz w:val="${textSize}"/><w:szCs w:val="${textSize}"/></w:rPr>` +
    `<w:t xml:space="preserve"> </w:t></w:r>` +
    `<w:r><w:rPr>${bodyFont}<w:color w:val="${style.bodyText}" w:themeColor="text1"/><w:sz w:val="${textSize}"/><w:szCs w:val="${textSize}"/></w:rPr>` +
    `<w:t>${description}</w:t></w:r></w:p>`
  );
}

function sectorCategory(label: string, style: ResolvedTemplateStyle): string {
  const bodyFont = fontRun(style.bodyFont);
  if (style.jobStyle === 'compact-dense') {
    return (
      `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
      `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
      `<w:spacing w:before="52" w:after="14" w:line="${Math.max(170, style.lineTwip - 110)}" w:lineRule="auto"/>` +
      `<w:rPr>${bodyFont}<w:b/><w:bCs/><w:color w:val="${style.sectionBannerText}"/><w:sz w:val="15"/><w:szCs w:val="15"/></w:rPr>` +
      `</w:pPr>` +
      `<w:r><w:rPr>${bodyFont}<w:b/><w:bCs/><w:color w:val="${style.sectionBannerText}"/><w:sz w:val="15"/><w:szCs w:val="15"/></w:rPr>` +
      `<w:t>${label}</w:t></w:r></w:p>`
    );
  }
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>` +
    `${BDR}` +
    `<w:spacing w:before="40" w:after="12" w:line="${style.lineTwip}" w:lineRule="auto"/>` +
    `<w:rPr>${bodyFont}<w:b/><w:bCs/><w:color w:val="${style.accentColor}"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${bodyFont}<w:b/><w:bCs/><w:color w:val="${style.accentColor}"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>` +
    `<w:t>${label}</w:t></w:r></w:p>`
  );
}

function sectorItem(text: string, style: ResolvedTemplateStyle, pageBreak = false): string {
  const bodyFont = fontRun(style.bodyFont);
  const pb = pageBreak ? '<w:r><w:br w:type="page"/></w:r>' : '';
  if (style.jobStyle === 'compact-dense') {
    return (
      `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
      `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
      `<w:ind w:left="150"/>` +
      `<w:spacing w:after="10" w:line="${Math.max(165, style.lineTwip - 115)}" w:lineRule="auto"/>` +
      `<w:rPr>${bodyFont}<w:color w:val="${style.mutedText}"/><w:sz w:val="14"/><w:szCs w:val="14"/></w:rPr>` +
      `</w:pPr>` +
      `<w:r><w:rPr>${bodyFont}<w:color w:val="${style.accentColor}"/><w:sz w:val="10"/><w:szCs w:val="10"/></w:rPr><w:t>•</w:t></w:r>` +
      `<w:r><w:rPr>${bodyFont}<w:color w:val="${style.mutedText}"/><w:sz w:val="14"/><w:szCs w:val="14"/></w:rPr><w:t xml:space="preserve"> ${text}</w:t></w:r>${pb}</w:p>`
    );
  }

  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>` +
    `<w:ind w:left="420" w:hanging="220"/>` +
    `<w:spacing w:after="18" w:line="${style.lineTwip}" w:lineRule="auto"/>` +
    `<w:jc w:val="both"/>` +
    `<w:rPr>${bodyFont}<w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${bodyFont}<w:color w:val="${style.accentColor}"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t>•</w:t></w:r>` +
    `<w:r><w:rPr>${bodyFont}<w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr><w:t xml:space="preserve"> ${text}</w:t></w:r>${pb}</w:p>`
  );
}

function spacer(style: ResolvedTemplateStyle): string {
  const bodyFont = fontRun(style.bodyFont);
  const compact = style.jobStyle === 'compact-dense';
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR0}>` +
    `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
    `<w:spacing w:line="${compact ? Math.max(170, style.lineTwip - 90) : style.lineTwip}" w:lineRule="auto"/>` +
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
  const color = style.jobStyle === 'ats-plain' ? style.bodyText : style.accentColor;
  const italic = style.jobStyle === 'classic-consulting';
  const compact = style.jobStyle === 'compact-dense';
  const size = compact ? 28 : 24;
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
    `<w:spacing w:after="${compact ? 12 : 0}" w:line="${style.lineTwip}" w:lineRule="auto"/><w:jc w:val="both"/>` +
    `<w:rPr>${bodyFont}<w:b/><w:bCs/>${italic ? '<w:i/><w:iCs/>' : ''}<w:color w:val="${color}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${bodyFont}<w:b/><w:bCs/>${italic ? '<w:i/><w:iCs/>' : ''}<w:color w:val="${color}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>` +
    `<w:t>${text}</w:t></w:r></w:p>`
  );
}

function jobDescription(text: string, style: ResolvedTemplateStyle): string {
  const bodyFont = fontRun(style.bodyFont);
  const color = style.jobStyle === 'modern-emphasis' ? style.accentColor : style.mutedText;
  const isItalic = style.jobStyle === 'classic-consulting';
  const isBold = style.jobStyle === 'modern-emphasis';
  const compact = style.jobStyle === 'compact-dense';
  const size = compact ? 23 : 22;
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
    `<w:spacing w:after="${compact ? 12 : 0}" w:line="${style.lineTwip}" w:lineRule="auto"/><w:jc w:val="both"/>` +
    `<w:rPr>${bodyFont}${isBold ? '<w:b/><w:bCs/>' : ''}${isItalic ? '<w:i/><w:iCs/>' : ''}<w:color w:val="${color}"/>` +
    `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${bodyFont}${isBold ? '<w:b/><w:bCs/>' : ''}${isItalic ? '<w:i/><w:iCs/>' : ''}<w:color w:val="${color}"/>` +
    `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>` +
    `<w:t>${text}</w:t></w:r></w:p>`
  );
}

function jobDates(text: string, style: ResolvedTemplateStyle): string {
  const bodyFont = fontRun(style.bodyFont);
  const color = style.jobStyle === 'ats-plain' ? style.mutedText : style.accentColor;
  const compact = style.jobStyle === 'compact-dense';
  const size = compact ? 22 : 20;
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
    `<w:spacing w:after="${compact ? 10 : 0}" w:line="${style.lineTwip}" w:lineRule="auto"/><w:jc w:val="both"/>` +
    `<w:rPr>${bodyFont}${style.jobStyle === 'ats-plain' ? '' : '<w:b/><w:bCs/>'}<w:color w:val="${color}"/>` +
    `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${bodyFont}${style.jobStyle === 'ats-plain' ? '' : '<w:b/><w:bCs/>'}<w:color w:val="${color}"/>` +
    `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>` +
    `<w:t>${text}</w:t></w:r></w:p>`
  );
}

function jobTitle(text: string, style: ResolvedTemplateStyle): string {
  const bodyFont = fontRun(style.bodyFont);
  const color = style.jobStyle === 'classic-consulting' ? style.bodyText : style.accentColor;
  const compact = style.jobStyle === 'compact-dense';
  const size = compact ? 24 : 22;
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
    `<w:spacing w:after="${compact ? 12 : 0}" w:line="${style.lineTwip}" w:lineRule="auto"/><w:jc w:val="both"/>` +
    `<w:rPr>${bodyFont}<w:b/><w:bCs/><w:color w:val="${color}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${bodyFont}<w:b/><w:bCs/><w:color w:val="${color}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>` +
    `<w:t>${text}</w:t></w:r></w:p>`
  );
}

function labelPara(text: string, style: ResolvedTemplateStyle): string {
  const bodyFont = fontRun(style.bodyFont);
  const compact = style.jobStyle === 'compact-dense';
  const size = compact ? 20 : 22;
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
    `<w:ind w:right="-57"/>` +
    `<w:spacing w:before="${compact ? 18 : 24}" w:after="${compact ? 18 : 24}" w:line="${style.lineTwip}" w:lineRule="auto"/>` +
    `<w:rPr>${bodyFont}<w:color w:val="${style.bodyText}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${bodyFont}<w:b/><w:bCs/><w:color w:val="${style.bodyText}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>` +
    `<w:t>${text}</w:t></w:r></w:p>`
  );
}

function bulletItem(text: string, style: ResolvedTemplateStyle): string {
  const bodyFont = fontRun(style.bodyFont);
  const compact = style.jobStyle === 'compact-dense';
  const textSize = compact ? 20 : 22;
  const bulletSize = compact ? 16 : 18;
  const compactIndent = 430;
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>` +
    `${BDR}` +
    (compact
      ? `<w:tabs><w:tab w:val="left" w:pos="${compactIndent}"/></w:tabs><w:ind w:left="${compactIndent}" w:hanging="${compactIndent}" w:right="-57"/>`
      : `<w:ind w:left="520" w:hanging="240" w:right="-57"/>`) +
    `<w:spacing w:after="${compact ? 28 : 32}" w:line="${compact ? Math.max(210, style.lineTwip - 40) : style.lineTwip}" w:lineRule="auto"/>` +
    `<w:rPr>${bodyFont}<w:color w:val="${style.bodyText}"/><w:sz w:val="${textSize}"/><w:szCs w:val="${textSize}"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${bodyFont}<w:color w:val="${style.accentColor}"/><w:sz w:val="${bulletSize}"/><w:szCs w:val="${bulletSize}"/></w:rPr><w:t>•</w:t></w:r>` +
    (compact
      ? `<w:r><w:rPr>${bodyFont}<w:color w:val="${style.bodyText}"/><w:sz w:val="${textSize}"/><w:szCs w:val="${textSize}"/></w:rPr><w:tab/><w:t>${text}</w:t></w:r>`
      : `<w:r><w:rPr>${bodyFont}<w:color w:val="${style.bodyText}"/><w:sz w:val="${textSize}"/><w:szCs w:val="${textSize}"/></w:rPr><w:t xml:space="preserve"> ${text}</w:t></w:r>`) +
    `</w:p>`
  );
}

function techEnvPara(label: string, text: string, style: ResolvedTemplateStyle): string {
  const bodyFont = fontRun(style.bodyFont);
  const compact = style.jobStyle === 'compact-dense';
  const labelSize = compact ? 20 : 22;
  const textSize = compact ? 20 : 22;
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
    `<w:spacing w:before="${compact ? 12 : 18}" w:after="${compact ? 22 : 18}" w:line="${style.lineTwip}" w:lineRule="auto"/>` +
    `<w:ind w:right="-57"/>` +
    `<w:rPr>${bodyFont}<w:color w:val="${style.bodyText}"/><w:sz w:val="${textSize}"/><w:szCs w:val="${textSize}"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${bodyFont}<w:b/><w:bCs/><w:color w:val="${style.bodyText}"/><w:sz w:val="${labelSize}"/><w:szCs w:val="${labelSize}"/></w:rPr>` +
    `<w:t>${label}</w:t></w:r>` +
    `<w:r><w:rPr>${bodyFont}<w:color w:val="${style.bodyText}"/><w:sz w:val="${textSize}"/><w:szCs w:val="${textSize}"/></w:rPr>` +
    `<w:t xml:space="preserve"> ${text}</w:t></w:r></w:p>`
  );
}

function educationLine(year: string, text: string, style: ResolvedTemplateStyle): string {
  const bodyFont = fontRun(style.bodyFont);
  if (style.jobStyle === 'compact-dense') {
    return (
      `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
      `<w:pPr><w:widowControl w:val="0"/>${BDR}<w:spacing w:before="14" w:after="2" w:line="${Math.max(165, style.lineTwip - 115)}" w:lineRule="auto"/>` +
      `<w:rPr>${bodyFont}<w:color w:val="${style.accentColor}"/><w:sz w:val="13"/><w:szCs w:val="13"/></w:rPr></w:pPr>` +
      `<w:r><w:rPr>${bodyFont}<w:color w:val="${style.accentColor}"/><w:sz w:val="13"/><w:szCs w:val="13"/></w:rPr><w:t>${year}</w:t></w:r>` +
      `</w:p>` +
      `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
      `<w:pPr><w:widowControl w:val="0"/>${BDR}<w:spacing w:after="16" w:line="${Math.max(165, style.lineTwip - 110)}" w:lineRule="auto"/>` +
      `<w:rPr>${bodyFont}<w:color w:val="${style.bodyText}"/><w:sz w:val="14"/><w:szCs w:val="14"/></w:rPr></w:pPr>` +
      `<w:r><w:rPr>${bodyFont}<w:color w:val="${style.bodyText}"/><w:sz w:val="14"/><w:szCs w:val="14"/></w:rPr><w:t>${text}</w:t></w:r>` +
      `</w:p>`
    );
  }

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

  if (style.jobStyle === 'compact-dense') {
    return [
      ...paragraphs,
      ...items.flatMap((group, groupIndex) => [
        sectorCategory(group.label, style),
        ...group.values.map((value, valueIndex) => {
          const isLastGroup = groupIndex === items.length - 1;
          const isLastValue = valueIndex === group.values.length - 1;
          return sectorItem(value, style, addPageBreak && isLastGroup && isLastValue);
        }),
      ]),
    ];
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

function renderSectionParagraphs(
  section: TemplateContract['sections'][number],
  data: CvData,
  style: ResolvedTemplateStyle,
  selectedJobs: CvData['experience'],
  additionalJobs: CvData['experience'],
  nextHasExperience: boolean,
): string[] {
  switch (section.key) {
    case 'technicalSkills':
    case 'coreSkills':
      return renderSkillsSection(section, data.technicalSkills, style);
    case 'sectorSkills':
    case 'sectorExperience':
      return renderSectorSection(section, data.sectors, data.domains, style, nextHasExperience);
    case 'experience':
      return renderExperienceSection(section, data.experience, style);
    case 'selectedExperience':
      return renderExperienceSection(section, selectedJobs, style);
    case 'additionalExperience':
      return renderExperienceSection(section, additionalJobs, style);
    case 'languages':
      return renderLanguagesSection(section, data.languages, style);
    case 'education':
      return renderEducationSection(section, data.education, style);
    case 'executiveSummary':
    case 'tools':
      if (section.required) {
        throw new Error(`Template section ${section.key} is required but has no renderer yet`);
      }
      return [];
    default: {
      const exhaustiveCheck: never = section.key;
      throw new Error(`Unhandled template section: ${exhaustiveCheck}`);
    }
  }
}

function buildCellMargins(top = 180, right = 180, bottom = 180, left = 180): string {
  return (
    '<w:tcMar>' +
    `<w:top w:w="${top}" w:type="dxa"/>` +
    `<w:right w:w="${right}" w:type="dxa"/>` +
    `<w:bottom w:w="${bottom}" w:type="dxa"/>` +
    `<w:left w:w="${left}" w:type="dxa"/>` +
    '</w:tcMar>'
  );
}

function buildTableCell(paragraphs: string[], params: {
  width: number;
  gridSpan?: number;
  shadingFill?: string;
  borders?: string;
  margins?: string;
}): string {
  return (
    '<w:tc>' +
    '<w:tcPr>' +
    `<w:tcW w:w="${params.width}" w:type="dxa"/>` +
    (params.gridSpan ? `<w:gridSpan w:val="${params.gridSpan}"/>` : '') +
    '<w:vAlign w:val="top"/>' +
    (params.shadingFill ? `<w:shd w:val="clear" w:color="auto" w:fill="${params.shadingFill}"/>` : '') +
    (params.borders ?? '') +
    (params.margins ?? buildCellMargins()) +
    '</w:tcPr>' +
    paragraphs.join('') +
    '</w:tc>'
  );
}

function buildOrbitLikeDocumentXml(data: CvData, contract: TemplateContract, xmlHeader: string, style: ResolvedTemplateStyle): string {
  const selectedJobs = data.experience.slice(0, 3);
  const additionalJobs = data.experience.slice(3);
  const leftParagraphs: string[] = [];
  const rightParagraphs: string[] = [
    buildHeaderParagraph({ text: data.name, font: style.headingFont, color: style.bodyText, size: 34, bold: true, after: 40 }),
    buildHeaderParagraph({
      text: [data.title_line1, data.title_line2].filter(Boolean).join(' | '),
      font: style.bodyFont,
      color: style.mutedText,
      size: 19,
      after: 24,
    }),
    buildHeaderParagraph({
      text: data.years ? `${data.years} years of experience` : ' ',
      font: style.bodyFont,
      color: style.accentColor,
      size: 18,
      smallCaps: true,
      after: 90,
      borderBottomColor: style.sectionBannerFill,
    }),
  ];

  contract.sections.forEach((section) => {
    const rendered = renderSectionParagraphs(section, data, style, selectedJobs, additionalJobs, false);
    if (rendered.length === 0) {
      return;
    }

    if (section.key === 'experience' || section.key === 'selectedExperience' || section.key === 'additionalExperience') {
      rightParagraphs.push(...rendered);
      return;
    }

    leftParagraphs.push(...rendered);
  });

  const table = (
    '    <w:tbl>' +
    '<w:tblPr>' +
    '<w:tblW w:w="0" w:type="auto"/>' +
    '<w:tblLayout w:type="fixed"/>' +
    '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>' +
    '</w:tblPr>' +
    '<w:tblGrid><w:gridCol w:w="2950"/><w:gridCol w:w="7150"/></w:tblGrid>' +
    '<w:tr>' +
    buildTableCell(leftParagraphs, {
      width: 2950,
      shadingFill: style.sectionBannerFill,
      margins: buildCellMargins(240, 210, 220, 260),
    }) +
    buildTableCell(rightParagraphs, {
      width: 7150,
      margins: buildCellMargins(140, 240, 180, 300),
    }) +
    '</w:tr></w:tbl>'
  );

  return xmlHeader + table + '\n' + SECT_PR;
}

function buildFramedDocumentXml(data: CvData, contract: TemplateContract, xmlHeader: string, style: ResolvedTemplateStyle): string {
  const selectedJobs = data.experience.slice(0, 3);
  const additionalJobs = data.experience.slice(3);
  const paragraphs: string[] = [
    buildHeaderParagraph({ text: data.name, font: style.headingFont, color: style.bodyText, size: 34, bold: true, after: 36 }),
    buildHeaderParagraph({
      text: [data.title_line1, data.title_line2].filter(Boolean).join(' | '),
      font: style.bodyFont,
      color: style.mutedText,
      size: 19,
      after: 24,
    }),
    buildHeaderParagraph({
      text: data.years ? `${data.years} years of experience` : ' ',
      font: style.bodyFont,
      color: style.accentColor,
      size: 17,
      smallCaps: true,
      after: 80,
      borderBottomColor: style.accentColor,
    }),
  ];

  contract.sections.forEach((section, index) => {
    const nextHasExperience = contract.sections.slice(index + 1).some((candidate) => EXPERIENCE_SECTION_KEYS.includes(candidate.key));
    paragraphs.push(...renderSectionParagraphs(section, data, style, selectedJobs, additionalJobs, nextHasExperience));
  });

  const framedTable = (
    '    <w:tbl>' +
    '<w:tblPr>' +
    '<w:tblW w:w="0" w:type="auto"/>' +
    '<w:tblLayout w:type="fixed"/>' +
    '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>' +
    '</w:tblPr>' +
    '<w:tblGrid><w:gridCol w:w="10100"/></w:tblGrid>' +
    '<w:tr>' +
    buildTableCell(paragraphs, {
      width: 10100,
      borders:
        '<w:tcBorders>' +
        `<w:top w:val="single" w:sz="18" w:space="0" w:color="${style.accentColor}"/>` +
        `<w:left w:val="single" w:sz="18" w:space="0" w:color="${style.accentColor}"/>` +
        `<w:bottom w:val="single" w:sz="18" w:space="0" w:color="${style.accentColor}"/>` +
        `<w:right w:val="single" w:sz="18" w:space="0" w:color="${style.accentColor}"/>` +
        '</w:tcBorders>',
      margins: buildCellMargins(240, 260, 220, 260),
    }) +
    '</w:tr></w:tbl>'
  );

  return xmlHeader + framedTable + '\n' + SECT_PR;
}

function buildKeystoneDocumentXml(data: CvData, contract: TemplateContract, xmlHeader: string, style: ResolvedTemplateStyle): string {
  const selectedJobs = data.experience.slice(0, 2);
  const additionalJobs = data.experience.slice(2);
  const leftParagraphs: string[] = [];
  const rightParagraphs: string[] = [];
  const bandParagraphs: string[] = [
    buildHeaderParagraph({
      text: data.name,
      font: style.headingFont,
      color: 'FFFFFF',
      size: 34,
      bold: true,
      after: 18,
    }),
    buildHeaderParagraph({
      text: [data.title_line1, data.title_line2].filter(Boolean).join(' | '),
      font: style.bodyFont,
      color: 'FFFFFF',
      size: 19,
      after: 18,
    }),
    buildHeaderParagraph({
      text: data.years ? `${data.years} years of experience` : ' ',
      font: style.bodyFont,
      color: 'D8E2EE',
      size: 17,
      smallCaps: true,
      after: 12,
    }),
  ];

  contract.sections.forEach((section) => {
    const rendered = renderSectionParagraphs(section, data, style, selectedJobs, additionalJobs, false);
    if (rendered.length === 0) {
      return;
    }

    if (section.key === 'experience' || section.key === 'selectedExperience' || section.key === 'additionalExperience') {
      rightParagraphs.push(...rendered);
      return;
    }

    leftParagraphs.push(...rendered);
  });

  const table = (
    '    <w:tbl>' +
    '<w:tblPr>' +
    '<w:tblW w:w="0" w:type="auto"/>' +
    '<w:tblLayout w:type="fixed"/>' +
    '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>' +
    '</w:tblPr>' +
    '<w:tblGrid><w:gridCol w:w="2600"/><w:gridCol w:w="7500"/></w:tblGrid>' +
    '<w:tr>' +
    buildTableCell(bandParagraphs, {
      width: 10100,
      gridSpan: 2,
      shadingFill: style.accentColor,
      margins: buildCellMargins(260, 260, 220, 260),
    }) +
    '</w:tr>' +
    '<w:tr>' +
    buildTableCell(leftParagraphs, {
      width: 2600,
      shadingFill: style.sectionBannerFill,
      margins: buildCellMargins(220, 180, 220, 220),
    }) +
    buildTableCell(rightParagraphs, {
      width: 7500,
      margins: buildCellMargins(220, 260, 220, 320),
    }) +
    '</w:tr></w:tbl>'
  );

  return xmlHeader + table + '\n' + SECT_PR;
}

function buildSolsticeDocumentXml(data: CvData, contract: TemplateContract, xmlHeader: string, style: ResolvedTemplateStyle): string {
  const selectedJobs = data.experience.slice(0, 2);
  const additionalJobs = data.experience.slice(2);
  const paragraphs: string[] = [
    buildHeaderParagraph({
      text: data.name,
      font: style.headingFont,
      color: style.bodyText,
      size: 30,
      bold: true,
      align: 'center',
      after: 16,
    }),
    buildHeaderParagraph({
      text: data.title_line1,
      font: style.bodyFont,
      color: style.accentColor,
      size: 19,
      italic: true,
      align: 'center',
      after: 8,
    }),
    buildHeaderParagraph({
      text: [data.title_line2, data.years ? `${data.years} years of experience` : ''].filter(Boolean).join(' | '),
      font: style.bodyFont,
      color: style.mutedText,
      size: 17,
      align: 'center',
      after: 80,
      borderBottomColor: style.accentColor,
    }),
  ];

  contract.sections.forEach((section, index) => {
    const nextHasExperience = contract.sections.slice(index + 1).some((candidate) => EXPERIENCE_SECTION_KEYS.includes(candidate.key));
    paragraphs.push(...renderSectionParagraphs(section, data, style, selectedJobs, additionalJobs, nextHasExperience));
  });

  return xmlHeader + paragraphs.join('\n') + '\n' + SECT_PR;
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
  const selectedJobs = data.experience.slice(0, 3);
  const additionalJobs = data.experience.slice(3);

  if (contract.layout.variant === 'professional-compact') {
    return buildOrbitLikeDocumentXml(data, contract, xmlHeader, style);
  }

  if (contract.layout.variant === 'executive-modern') {
    return buildFramedDocumentXml(data, contract, xmlHeader, style);
  }

  if (contract.layout.variant === 'brand-accent') {
    return buildKeystoneDocumentXml(data, contract, xmlHeader, style);
  }

  if (contract.layout.variant === 'consulting-classic') {
    return buildSolsticeDocumentXml(data, contract, xmlHeader, style);
  }

  const paragraphs: string[] = [];

  contract.sections.forEach((section, index) => {
    const nextHasExperience = contract.sections.slice(index + 1).some((candidate) => EXPERIENCE_SECTION_KEYS.includes(candidate.key));
    paragraphs.push(...renderSectionParagraphs(section, data, style, selectedJobs, additionalJobs, nextHasExperience));
  });

  return xmlHeader + paragraphs.join('\n') + '\n' + SECT_PR;
}

function buildHeaderParagraph(params: {
  text: string;
  font: string;
  color: string;
  size: number;
  align?: 'left' | 'center';
  bold?: boolean;
  italic?: boolean;
  caps?: boolean;
  smallCaps?: boolean;
  before?: number;
  after?: number;
  borderBottomColor?: string;
  shadingFill?: string;
}): string {
  const font = fontRun(params.font);
  const bold = params.bold ? '<w:b/><w:bCs/>' : '';
  const italic = params.italic ? '<w:i/><w:iCs/>' : '';
  const caps = params.caps ? '<w:caps/>' : '';
  const smallCaps = params.smallCaps ? '<w:smallCaps/>' : '';
  const borderBottom = params.borderBottomColor
    ? `<w:pBdr><w:bottom w:val="single" w:sz="10" w:space="1" w:color="${params.borderBottomColor}"/></w:pBdr>`
    : '';
  const shading = params.shadingFill
    ? `<w:shd w:val="clear" w:color="auto" w:fill="${params.shadingFill}"/>`
    : '';

  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>${borderBottom}${shading}` +
    `<w:spacing w:before="${params.before ?? 0}" w:after="${params.after ?? 0}"/>` +
    `<w:jc w:val="${params.align ?? 'left'}"/>` +
    `<w:rPr>${font}${bold}${italic}${caps}${smallCaps}<w:color w:val="${params.color}"/><w:sz w:val="${params.size}"/><w:szCs w:val="${params.size}"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${font}${bold}${italic}${caps}${smallCaps}<w:color w:val="${params.color}"/><w:sz w:val="${params.size}"/><w:szCs w:val="${params.size}"/></w:rPr>` +
    `<w:t xml:space="preserve">${params.text || ' '}</w:t></w:r></w:p>`
  );
}

function buildTabbedHeaderParagraph(params: {
  leftText: string;
  rightText: string;
  font: string;
  color: string;
  size: number;
  before?: number;
  after?: number;
  borderBottomColor?: string;
}): string {
  const font = fontRun(params.font);
  const borderBottom = params.borderBottomColor
    ? `<w:pBdr><w:bottom w:val="single" w:sz="10" w:space="1" w:color="${params.borderBottomColor}"/></w:pBdr>`
    : '';

  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>${borderBottom}` +
    `<w:tabs><w:tab w:val="right" w:pos="9300"/></w:tabs>` +
    `<w:spacing w:before="${params.before ?? 0}" w:after="${params.after ?? 0}"/>` +
    `<w:jc w:val="left"/>` +
    `<w:rPr>${font}<w:b/><w:bCs/><w:color w:val="${params.color}"/><w:sz w:val="${params.size}"/><w:szCs w:val="${params.size}"/></w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${font}<w:b/><w:bCs/><w:color w:val="${params.color}"/><w:sz w:val="${params.size}"/><w:szCs w:val="${params.size}"/></w:rPr><w:t>${params.leftText}</w:t></w:r>` +
    `<w:r><w:rPr>${font}<w:b/><w:bCs/><w:color w:val="${params.color}"/><w:sz w:val="${params.size}"/><w:szCs w:val="${params.size}"/></w:rPr><w:tab/><w:t>${params.rightText}</w:t></w:r>` +
    `</w:p>`
  );
}

function getStoryWrapper(xml: string, tagName: 'w:hdr' | 'w:ftr'): { opening: string; closing: string } {
  const openIndex = xml.indexOf(`<${tagName}`);
  const closeIndex = xml.lastIndexOf(`</${tagName}>`);

  if (openIndex === -1 || closeIndex === -1) {
    throw new Error(`Could not find ${tagName} wrapper in story XML`);
  }

  const openingEnd = xml.indexOf('>', openIndex);
  if (openingEnd === -1) {
    throw new Error(`Malformed ${tagName} wrapper`);
  }

  return {
    opening: xml.slice(0, openingEnd + 1),
    closing: xml.slice(closeIndex),
  };
}

function buildEmptyStoryXml(existingXml: string, tagName: 'w:hdr' | 'w:ftr'): string {
  const wrapper = getStoryWrapper(existingXml, tagName);
  const paragraph = (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    '<w:pPr><w:widowControl w:val="0"/></w:pPr>' +
    '<w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>'
  );
  return `${wrapper.opening}${paragraph}${wrapper.closing}`;
}

export function buildTemplateHeaderXml(
  existingXml: string,
  data: Pick<CvData, 'name' | 'title_line1' | 'title_line2' | 'years'>,
  contract: TemplateContract,
): string {
  if (
    contract.layout.variant === 'professional-compact' ||
    contract.layout.variant === 'brand-accent' ||
    contract.layout.variant === 'executive-modern' ||
    contract.layout.variant === 'consulting-classic'
  ) {
    return buildEmptyStoryXml(existingXml, 'w:hdr');
  }

  const style = resolveTemplateStyle(contract);
  const wrapper = getStoryWrapper(existingXml, 'w:hdr');
  const headline = data.title_line1.trim();
  const subheadline = data.title_line2.trim();
  const combinedHeadline = [headline, subheadline].filter(Boolean).join(' | ');
  const yearsLine = data.years ? `${data.years} years of experience` : '';
  const paragraphs: string[] = [];

  switch (style.headerStyle) {
    case 'ats-minimal':
      paragraphs.push(
        buildHeaderParagraph({ text: data.name, font: style.headingFont, color: style.bodyText, size: 34, bold: true, after: 60 }),
      );
      if (combinedHeadline) {
        paragraphs.push(
          buildHeaderParagraph({ text: combinedHeadline, font: style.bodyFont, color: style.mutedText, size: 21, after: 40 }),
        );
      }
      if (yearsLine) {
        paragraphs.push(
          buildHeaderParagraph({ text: yearsLine, font: style.bodyFont, color: style.mutedText, size: 18, smallCaps: true, after: 120, borderBottomColor: style.accentColor }),
        );
      }
      break;
    case 'simple-clean':
      paragraphs.push(
        buildHeaderParagraph({ text: data.name, font: style.headingFont, color: style.bodyText, size: 36, bold: true, after: 40 }),
      );
      if (headline) {
        paragraphs.push(
          buildHeaderParagraph({ text: headline, font: style.bodyFont, color: style.accentColor, size: 22, bold: true, after: 20 }),
        );
      }
      if (subheadline) {
        paragraphs.push(
          buildHeaderParagraph({ text: subheadline, font: style.bodyFont, color: style.mutedText, size: 20, after: 20 }),
        );
      }
      if (yearsLine) {
        paragraphs.push(
          buildHeaderParagraph({ text: yearsLine, font: style.bodyFont, color: style.mutedText, size: 18, after: 120, borderBottomColor: style.sectionBannerFill }),
        );
      }
      break;
    case 'compact-split':
      paragraphs.push(
        buildTabbedHeaderParagraph({
          leftText: data.name,
          rightText: yearsLine || ' ',
          font: style.headingFont,
          color: style.bodyText,
          size: 28,
          after: 20,
          borderBottomColor: style.sectionBannerFill,
        }),
      );
      if (headline || subheadline) {
        paragraphs.push(
          buildHeaderParagraph({
            text: [headline, subheadline].filter(Boolean).join(' | '),
            font: style.bodyFont,
            color: style.mutedText,
            size: 18,
            after: 80,
          }),
        );
      }
      break;
    case 'modern-band':
      paragraphs.push(
        buildHeaderParagraph({ text: ' ', font: style.headingFont, color: 'FFFFFF', size: 8, shadingFill: style.accentColor, after: 110 }),
      );
      paragraphs.push(
        buildHeaderParagraph({ text: data.name, font: style.headingFont, color: style.bodyText, size: 38, bold: true, align: 'center', after: 28 }),
      );
      if (headline) {
        paragraphs.push(
          buildHeaderParagraph({ text: headline, font: style.bodyFont, color: style.accentColor, size: 22, bold: true, align: 'center', after: 12 }),
        );
      }
      if (subheadline) {
        paragraphs.push(
          buildHeaderParagraph({ text: subheadline, font: style.bodyFont, color: style.mutedText, size: 20, align: 'center', after: 12 }),
        );
      }
      if (yearsLine) {
        paragraphs.push(
          buildHeaderParagraph({ text: yearsLine, font: style.bodyFont, color: style.mutedText, size: 18, align: 'center', after: 70 }),
        );
        paragraphs.push(
          buildHeaderParagraph({ text: ' ', font: style.headingFont, color: 'FFFFFF', size: 8, shadingFill: style.sectionBannerFill, after: 120 }),
        );
      }
      break;
    case 'professional-classic':
      paragraphs.push(
        buildHeaderParagraph({ text: data.name, font: style.headingFont, color: style.bodyText, size: 34, bold: true, after: 40 }),
      );
      if (headline) {
        paragraphs.push(
          buildHeaderParagraph({ text: headline, font: style.bodyFont, color: style.accentColor, size: 21, italic: true, after: 20 }),
        );
      }
      if (subheadline) {
        paragraphs.push(
          buildHeaderParagraph({ text: subheadline, font: style.bodyFont, color: style.bodyText, size: 20, after: 20 }),
        );
      }
      if (yearsLine) {
        paragraphs.push(
          buildHeaderParagraph({ text: yearsLine, font: style.bodyFont, color: style.mutedText, size: 18, smallCaps: true, after: 140, borderBottomColor: style.accentColor }),
        );
      }
      break;
    case 'brand-accent':
    default:
      paragraphs.push(
        buildHeaderParagraph({ text: data.name, font: style.headingFont, color: style.bodyText, size: 36, bold: true, after: 30 }),
      );
      if (headline) {
        paragraphs.push(
          buildHeaderParagraph({ text: headline, font: style.bodyFont, color: style.accentColor, size: 22, bold: true, after: 20 }),
        );
      }
      if (subheadline) {
        paragraphs.push(
          buildHeaderParagraph({ text: subheadline, font: style.bodyFont, color: style.mutedText, size: 20, after: 20 }),
        );
      }
      if (yearsLine) {
        paragraphs.push(
          buildHeaderParagraph({ text: yearsLine, font: style.bodyFont, color: style.mutedText, size: 18, after: 120, borderBottomColor: style.accentColor }),
        );
      }
      break;
  }

  return `${wrapper.opening}${paragraphs.join('')}${wrapper.closing}`;
}

export async function writeTemplateHeader(
  headerPath: string,
  data: Pick<CvData, 'name' | 'title_line1' | 'title_line2' | 'years'>,
  contract: TemplateContract,
): Promise<void> {
  const xml = await readFile(headerPath, 'utf-8');
  await writeFile(headerPath, buildTemplateHeaderXml(xml, data, contract), 'utf-8');
}
