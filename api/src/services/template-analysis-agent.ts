import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { extractHeaderInfo, extractTextFromDocx } from './docx-reader.js';
import {
  templateContractSchema,
  type TemplateContract,
  type TemplateSectionKey,
  type TemplateVariant,
} from './template-contract.js';

export type TemplateAnalysisProfile = 'scalian' | 'cgi';

export interface TemplateAnalysisResult {
  profile: TemplateAnalysisProfile;
  sourceDocxPath: string;
  analyzedAt: string;
  detectedHeader: {
    name: string;
    title_line1: string;
    title_line2: string;
    years: string;
  };
  detectedSectionHeadings: string[];
  detectedFonts: string[];
  detectedColors: {
    text: string[];
    fills: string[];
  };
  notes: string[];
  templateContract: TemplateContract;
}

const PROFILE_DEFAULTS: Record<TemplateAnalysisProfile, {
  variant: TemplateVariant;
  outputPattern: string;
  sectionOrder: Array<{ key: TemplateSectionKey; label: string; required: boolean; repeatable: boolean }>;
  fallbackColors: {
    accent: string;
    sectionBannerFill: string;
    sectionBannerText: string;
    headingText: string;
  };
  fallbackFonts: {
    heading: string;
    body: string;
  };
  spacing: {
    sectionBeforeTwip: number;
    sectionAfterTwip: number;
    lineTwip: number;
  };
}> = {
  scalian: {
    variant: 'brand-accent',
    outputPattern: 'Scalian_Profile_{name}.docx',
    sectionOrder: [
      { key: 'technicalSkills', label: 'TECHNICAL SKILLS', required: true, repeatable: false },
      { key: 'sectorSkills', label: 'SECTOR-SPECIFIC SKILLS', required: true, repeatable: false },
      { key: 'experience', label: 'WORK EXPERIENCE', required: true, repeatable: true },
      { key: 'languages', label: 'LANGUAGES SKILLS', required: true, repeatable: false },
      { key: 'education', label: 'EDUCATION/CERTIFICATION', required: true, repeatable: false },
    ],
    fallbackColors: {
      accent: '7030A0',
      sectionBannerFill: 'E6E6E6',
      sectionBannerText: '7030A0',
      headingText: '7030A0',
    },
    fallbackFonts: {
      heading: 'Cambria',
      body: 'Cambria',
    },
    spacing: {
      sectionBeforeTwip: 240,
      sectionAfterTwip: 240,
      lineTwip: 300,
    },
  },
  cgi: {
    variant: 'consulting-classic',
    outputPattern: 'CGI_Profile_{name}.docx',
    sectionOrder: [
      { key: 'executiveSummary', label: 'PROFILE', required: false, repeatable: false },
      { key: 'technicalSkills', label: 'SKILLS SUMMARY', required: true, repeatable: false },
      { key: 'sectorExperience', label: 'INDUSTRY EXPERIENCE', required: true, repeatable: false },
      { key: 'selectedExperience', label: 'SELECTED EXPERIENCE', required: true, repeatable: true },
      { key: 'additionalExperience', label: 'ADDITIONAL EXPERIENCE', required: false, repeatable: true },
      { key: 'education', label: 'EDUCATION & CERTIFICATIONS', required: true, repeatable: false },
    ],
    fallbackColors: {
      accent: '23435B',
      sectionBannerFill: 'E6EEF5',
      sectionBannerText: '23435B',
      headingText: '23435B',
    },
    fallbackFonts: {
      heading: 'Segoe UI',
      body: 'Segoe UI',
    },
    spacing: {
      sectionBeforeTwip: 220,
      sectionAfterTwip: 220,
      lineTwip: 300,
    },
  },
};

const HEADING_HINTS: Array<{
  matchers: RegExp[];
  normalizedLabel: string;
}> = [
  { matchers: [/^TECHNICAL SKILLS$/i], normalizedLabel: 'TECHNICAL SKILLS' },
  { matchers: [/^SECTOR[- ]SPECIFIC SKILLS$/i, /^SECTOR EXPERIENCE$/i], normalizedLabel: 'SECTOR-SPECIFIC SKILLS' },
  { matchers: [/^WORK EXPERIENCE$/i], normalizedLabel: 'WORK EXPERIENCE' },
  { matchers: [/^LANGUAGES SKILLS$/i, /^LANGUAGES$/i], normalizedLabel: 'LANGUAGES SKILLS' },
  { matchers: [/^EDUCATION\/CERTIFICATION$/i, /^EDUCATION$/i, /^TRAININGS AND CERTIFICATIONS$/i, /^EDUCATION & CERTIFICATIONS$/i], normalizedLabel: 'EDUCATION & CERTIFICATIONS' },
  { matchers: [/^PROFILE$/i, /^PROFIL$/i], normalizedLabel: 'PROFILE' },
  { matchers: [/^SKILLS SUMMARY$/i], normalizedLabel: 'SKILLS SUMMARY' },
  { matchers: [/^SELECTED EXPERIENCE$/i, /^EXP[ÉE]RIENCE CGI$/i], normalizedLabel: 'SELECTED EXPERIENCE' },
  { matchers: [/^ADDITIONAL EXPERIENCE$/i, /^AUTRES EXP[ÉE]RIENCES(?: \(EXTRAIT\))?$/i], normalizedLabel: 'ADDITIONAL EXPERIENCE' },
  { matchers: [/^INDUSTRY EXPERIENCE$/i, /^Industry experience$/], normalizedLabel: 'INDUSTRY EXPERIENCE' },
];

const EXCLUDED_FONT_NAMES = new Set([
  'SYMBOL',
  'WINGDINGS',
  'WEBDINGS',
  'SEGOE UI SYMBOL',
  'NOTO SANS SYMBOLS',
]);

const DEPRIORITIZED_FONT_NAMES = new Set([
  'COURIER',
  'COURIER NEW',
  'CONSOLAS',
  'LUCIDA CONSOLE',
]);

function countValues(values: string[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()].sort((left, right) => right[1] - left[1]);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function pickTopDistinct(values: string[], limit: number): string[] {
  return countValues(values).map(([value]) => value).slice(0, limit);
}

function normalizeDetectedHeading(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  for (const hint of HEADING_HINTS) {
    if (hint.matchers.some((matcher) => matcher.test(trimmed))) {
      return hint.normalizedLabel;
    }
  }

  const hasLetters = /[A-Z]/i.test(trimmed);
  const looksLikeHeading = hasLetters && trimmed === trimmed.toUpperCase() && trimmed.length <= 40;
  return looksLikeHeading ? trimmed : null;
}

async function readAllWordXml(docxPath: string): Promise<string[]> {
  const data = await readFile(docxPath);
  const zip = await JSZip.loadAsync(data);
  const xmlFiles = Object.keys(zip.files)
    .filter((name) => name.startsWith('word/') && name.endsWith('.xml'))
    .sort();

  return Promise.all(xmlFiles.map(async (name) => zip.file(name)?.async('string') ?? ''));
}

function collectRegexMatches(xmlDocuments: string[], regex: RegExp, exclude: Set<string> = new Set()): string[] {
  const matches: string[] = [];
  xmlDocuments.forEach((xml) => {
    for (const match of xml.matchAll(regex)) {
      const value = match[1]?.trim();
      if (!value || exclude.has(value.toUpperCase())) {
        continue;
      }
      matches.push(value.replace(/^#/, '').toUpperCase());
    }
  });
  return matches;
}

function toDisplayFontName(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

  return normalized
    .replace(/\bUi\b/g, 'UI')
    .replace(/\bMso\b/g, 'MSO');
}

function selectDetectedFonts(profile: TemplateAnalysisProfile, fonts: string[]): string[] {
  const defaults = PROFILE_DEFAULTS[profile].fallbackFonts;
  const filtered = unique(
    fonts
      .map((font) => font.trim().toUpperCase())
      .filter((font) => font && !EXCLUDED_FONT_NAMES.has(font)),
  );

  const preferred = unique([
    defaults.heading.toUpperCase(),
    defaults.body.toUpperCase(),
    ...filtered.filter((font) => !DEPRIORITIZED_FONT_NAMES.has(font)),
  ]);

  return preferred.slice(0, 4).map((font) => toDisplayFontName(font));
}

function hexChannel(value: string, start: number): number {
  return Number.parseInt(value.slice(start, start + 2), 16);
}

function isLightColor(value: string): boolean {
  const normalized = value.trim().replace(/^#/, '').toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(normalized)) {
    return false;
  }

  const brightness = (
    (hexChannel(normalized, 0) * 299) +
    (hexChannel(normalized, 2) * 587) +
    (hexChannel(normalized, 4) * 114)
  ) / 1000;

  return brightness >= 200;
}

function selectSectionBannerFill(
  profile: TemplateAnalysisProfile,
  accent: string,
  fillColors: string[],
): string {
  const defaults = PROFILE_DEFAULTS[profile].fallbackColors;
  const candidates = fillColors
    .map((color) => color.trim().replace(/^#/, '').toUpperCase())
    .filter((color) => color && color !== accent);

  return candidates.find((color) => isLightColor(color)) ?? defaults.sectionBannerFill;
}

function buildReferenceHeader(
  profile: TemplateAnalysisProfile,
  header: Awaited<ReturnType<typeof extractHeaderInfo>>,
): TemplateAnalysisResult['detectedHeader'] {
  if (profile === 'scalian') {
    const title = [header.name, header.title_line1].filter(Boolean).join(' ').trim() || 'Executive Advisor';
    const years = [header.title_line2, header.years].filter(Boolean).join(' ').trim() || 'XX years of experience';
    return {
      name: '[redacted]',
      title_line1: title,
      title_line2: '',
      years,
    };
  }

  return {
    name: 'Candidate Name',
    title_line1: 'Executive Consulting Headline',
    title_line2: 'Consulting Lead',
    years: 'XX years of experience',
  };
}

function buildSections(
  profile: TemplateAnalysisProfile,
  headings: string[],
): TemplateContract['sections'] {
  const defaults = PROFILE_DEFAULTS[profile].sectionOrder;
  const detected = new Set(headings.map((heading) => heading.toUpperCase()));

  return defaults
    .filter((section) => {
      if (section.required) {
        return true;
      }
      if (profile === 'cgi' && section.key === 'executiveSummary') {
        return detected.has('PROFILE');
      }
      if (profile === 'cgi' && section.key === 'additionalExperience') {
        return detected.has('ADDITIONAL EXPERIENCE');
      }
      return detected.has(section.label.toUpperCase());
    })
    .map((section) => ({ ...section }));
}

function buildContract(params: {
  profile: TemplateAnalysisProfile;
  header: Awaited<ReturnType<typeof extractHeaderInfo>>;
  headings: string[];
  fonts: string[];
  textColors: string[];
  fillColors: string[];
}): TemplateContract {
  const defaults = PROFILE_DEFAULTS[params.profile];
  const selectedFonts = selectDetectedFonts(params.profile, params.fonts);
  const headingFont = selectedFonts[0] ?? defaults.fallbackFonts.heading;
  const bodyFont = defaults.fallbackFonts.body === defaults.fallbackFonts.heading
    ? headingFont
    : selectedFonts.find((font) => font !== headingFont && !DEPRIORITIZED_FONT_NAMES.has(font.toUpperCase()))
      ?? defaults.fallbackFonts.body;
  const accent = params.textColors[0] ?? defaults.fallbackColors.accent;
  const sectionBannerFill = selectSectionBannerFill(params.profile, accent, params.fillColors);
  const sections = buildSections(params.profile, params.headings);

  const contract = templateContractSchema.parse({
    version: 'v1',
    layout: {
      family: 'single-column',
      variant: defaults.variant,
    },
    header: {
      fields: [
        { key: 'name', placeholder: 'Candidate Name' },
        { key: 'headline', placeholder: params.profile === 'cgi' ? 'Executive Consulting Headline' : 'Executive Advisor' },
        { key: 'subheadline', placeholder: params.profile === 'cgi' ? 'Consulting Lead' : 'Transformation & Delivery Lead' },
        { key: 'years_of_experience', placeholder: 'XX years of experience' },
      ],
      limits: {
        headlineMaxChars: params.profile === 'cgi' ? 52 : 40,
        subheadlineMaxChars: params.profile === 'cgi' ? 52 : 40,
      },
    },
    sections,
    styleTokens: {
      colors: {
        accent,
        sectionBannerFill,
        sectionBannerText: accent,
        headingText: accent,
        bodyText: '000000',
      },
      fonts: {
        heading: headingFont,
        body: bodyFont,
      },
      spacing: defaults.spacing,
    },
    output: {
      filenamePattern: defaults.outputPattern,
    },
  });

  return contract;
}

export async function analyzeTemplateDocx(
  docxPath: string,
  profile: TemplateAnalysisProfile,
): Promise<TemplateAnalysisResult> {
  const [text, header, xmlDocuments] = await Promise.all([
    extractTextFromDocx(docxPath),
    extractHeaderInfo(docxPath),
    readAllWordXml(docxPath),
  ]);

  const headings = unique(
    text
      .split('\n')
      .map((line) => normalizeDetectedHeading(line))
      .filter((value): value is string => Boolean(value)),
  );

  const fonts = pickTopDistinct(
    collectRegexMatches(xmlDocuments, /w:rFonts[^>]*w:ascii="([^"]+)"/g, new Set(['SYMBOL'])),
    4,
  );

  const textColors = pickTopDistinct(
    collectRegexMatches(xmlDocuments, /w:color[^>]*w:val="([0-9A-Fa-f]{6})"/g, new Set(['000000', 'FFFFFF', 'AUTO'])),
    4,
  );

  const fillColors = pickTopDistinct(
    collectRegexMatches(xmlDocuments, /w:shd[^>]*w:fill="([0-9A-Fa-f]{6})"/g, new Set(['FFFFFF', 'AUTO'])),
    4,
  );

  const contract = buildContract({
    profile,
    header,
    headings,
    fonts,
    textColors,
    fillColors,
  });

  const notes: string[] = [];
  if (profile === 'cgi' && headings.includes('TRAININGS AND CERTIFICATIONS')) {
    notes.push('Merged EDUCATION and TRAININGS AND CERTIFICATIONS into EDUCATION & CERTIFICATIONS.');
  }
  if (profile === 'cgi' && !headings.includes('INDUSTRY EXPERIENCE')) {
    notes.push('INDUSTRY EXPERIENCE inferred from the summary table when not exposed as an uppercase section heading.');
  }
  notes.push('Header placeholders normalized for committed reference artifacts.');

  return {
    profile,
    sourceDocxPath: docxPath,
    analyzedAt: new Date().toISOString(),
    detectedHeader: buildReferenceHeader(profile, header),
    detectedSectionHeadings: headings,
    detectedFonts: selectDetectedFonts(profile, fonts),
    detectedColors: {
      text: textColors,
      fills: fillColors,
    },
    notes,
    templateContract: contract,
  };
}
