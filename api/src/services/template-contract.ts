import { z } from 'zod';
import type { CvData } from './cv-agent.js';

export const templateVariantSchema = z.enum([
  'ats-core',
  'consulting-classic',
  'executive-modern',
  'professional-compact',
  'brand-accent',
]);

export const templateHeaderFieldKeySchema = z.enum([
  'name',
  'headline',
  'subheadline',
  'years_of_experience',
]);

export const templateSectionKeySchema = z.enum([
  'executiveSummary',
  'technicalSkills',
  'coreSkills',
  'sectorSkills',
  'sectorExperience',
  'experience',
  'selectedExperience',
  'additionalExperience',
  'languages',
  'education',
  'tools',
]);

export const templateContractSchema = z.object({
  version: z.literal('v1'),
  layout: z.object({
    family: z.literal('single-column'),
    variant: templateVariantSchema,
  }),
  header: z.object({
    fields: z.array(z.object({
      key: templateHeaderFieldKeySchema,
      placeholder: z.string().trim().min(1),
    })).min(1),
    limits: z.object({
      headlineMaxChars: z.number().int().positive(),
      subheadlineMaxChars: z.number().int().positive(),
    }),
  }),
  sections: z.array(z.object({
    key: templateSectionKeySchema,
    label: z.string().trim().min(1),
    required: z.boolean(),
    repeatable: z.boolean(),
  })).min(1),
  styleTokens: z.object({
    colors: z.record(z.string().trim().min(1)),
    fonts: z.record(z.union([z.string().trim().min(1), z.number()])),
    spacing: z.record(z.union([z.string().trim().min(1), z.number()])),
  }),
  output: z.object({
    filenamePattern: z.string().trim().min(1),
  }),
}).strict();

export type TemplateVariant = z.infer<typeof templateVariantSchema>;
export type TemplateSectionKey = z.infer<typeof templateSectionKeySchema>;
export type TemplateContract = z.infer<typeof templateContractSchema>;

export const legacyTemplateSeedSchema = z.object({
  headerFields: z.object({
    namePlaceholder: z.string().trim().min(1).optional(),
    titleLine1Placeholder: z.string().trim().min(1).optional(),
    titleLine2Placeholder: z.string().trim().min(1).optional(),
    yearsPlaceholder: z.string().trim().min(1).optional(),
  }).optional(),
  sections: z.array(templateSectionKeySchema).optional(),
  outputNaming: z.string().trim().min(1).optional(),
}).passthrough();

export const legacyThemeSeedSchema = z.record(z.string()).optional();

type LegacyTemplateSeed = z.infer<typeof legacyTemplateSeedSchema>;
type LegacyThemeSeed = z.infer<typeof legacyThemeSeedSchema>;

const defaultSectionOrder: TemplateSectionKey[] = [
  'technicalSkills',
  'sectorSkills',
  'experience',
  'languages',
  'education',
];

const defaultSectionDefinitions: Record<TemplateSectionKey, { label: string; required: boolean; repeatable: boolean }> = {
  executiveSummary: { label: 'EXECUTIVE SUMMARY', required: false, repeatable: false },
  technicalSkills: { label: 'TECHNICAL SKILLS', required: true, repeatable: false },
  coreSkills: { label: 'CORE SKILLS', required: false, repeatable: false },
  sectorSkills: { label: 'SECTOR-SPECIFIC SKILLS', required: true, repeatable: false },
  sectorExperience: { label: 'SECTOR EXPERIENCE', required: false, repeatable: false },
  experience: { label: 'WORK EXPERIENCE', required: true, repeatable: true },
  selectedExperience: { label: 'SELECTED EXPERIENCE', required: false, repeatable: true },
  additionalExperience: { label: 'ADDITIONAL EXPERIENCE', required: false, repeatable: true },
  languages: { label: 'LANGUAGES SKILLS', required: true, repeatable: false },
  education: { label: 'EDUCATION/CERTIFICATION', required: true, repeatable: false },
  tools: { label: 'TOOLS / ENVIRONMENT', required: false, repeatable: false },
};

function toTemplateSections(sectionKeys?: TemplateSectionKey[]) {
  return (sectionKeys && sectionKeys.length > 0 ? sectionKeys : defaultSectionOrder).map((key) => ({
    key,
    ...defaultSectionDefinitions[key],
  }));
}

export function buildLegacyTemplateContract(options: {
  templateContractVersion: string;
  variant: string;
  theme?: LegacyThemeSeed;
  template?: LegacyTemplateSeed;
}): TemplateContract {
  const variant = templateVariantSchema.parse(options.variant);
  const template = legacyTemplateSeedSchema.parse(options.template ?? {});
  const theme = legacyThemeSeedSchema.parse(options.theme);

  const contract = {
    version: 'v1' as const,
    layout: {
      family: 'single-column' as const,
      variant,
    },
    header: {
      fields: [
        { key: 'name' as const, placeholder: template.headerFields?.namePlaceholder ?? 'Candidate Name' },
        { key: 'headline' as const, placeholder: template.headerFields?.titleLine1Placeholder ?? 'Executive' },
        { key: 'subheadline' as const, placeholder: template.headerFields?.titleLine2Placeholder ?? 'Consulting Lead' },
        { key: 'years_of_experience' as const, placeholder: template.headerFields?.yearsPlaceholder ?? 'XX' },
      ],
      limits: {
        headlineMaxChars: 40,
        subheadlineMaxChars: 40,
      },
    },
    sections: toTemplateSections(template.sections),
    styleTokens: {
      colors: {
        accent: theme?.accentColor ?? '#7030A0',
        sectionBannerFill: theme?.surfaceSubtle ?? '#E6E6E6',
        sectionBannerText: theme?.primaryDark ?? '#7030A0',
        headingText: theme?.primaryColor ?? '#7030A0',
        bodyText: '#000000',
      },
      fonts: {
        heading: theme?.fontHeading ?? 'Cambria',
        body: theme?.fontBody ?? 'Cambria',
      },
      spacing: {
        sectionBeforeTwip: 240,
        sectionAfterTwip: 240,
        lineTwip: 300,
      },
    },
    output: {
      filenamePattern: template.outputNaming ?? 'CV_Profile_{name}.docx',
    },
  };

  const parsed = templateContractSchema.parse(contract);
  if (parsed.version !== options.templateContractVersion) {
    throw new Error(`Template contract version mismatch: config=${options.templateContractVersion}, contract=${parsed.version}`);
  }
  return parsed;
}

export function ensureTemplateContract(options: {
  templateContractVersion: string;
  variant: string;
  theme?: LegacyThemeSeed;
  template?: LegacyTemplateSeed;
  templateContract?: unknown;
}): TemplateContract {
  const contract = options.templateContract
    ? templateContractSchema.parse(options.templateContract)
    : buildLegacyTemplateContract({
      templateContractVersion: options.templateContractVersion,
      variant: options.variant,
      theme: options.theme,
      template: options.template,
    });

  if (contract.version !== options.templateContractVersion) {
    throw new Error(`Template contract version mismatch: config=${options.templateContractVersion}, contract=${contract.version}`);
  }

  if (contract.layout.variant !== options.variant) {
    throw new Error(`Template contract variant mismatch: config=${options.variant}, contract=${contract.layout.variant}`);
  }

  return contract;
}

export function cloneTemplateContractWithVariant(
  contract: TemplateContract,
  variant: TemplateVariant,
): TemplateContract {
  return templateContractSchema.parse({
    ...contract,
    layout: {
      ...contract.layout,
      variant,
    },
  });
}

export function getRequiredSectionLabels(contract: TemplateContract): string[] {
  return contract.sections.filter((section) => section.required).map((section) => section.label);
}

export function getPrimaryExperienceSectionLabel(contract: TemplateContract): string | null {
  const experienceSection = contract.sections.find((section) =>
    section.key === 'experience' || section.key === 'selectedExperience' || section.key === 'additionalExperience');
  return experienceSection?.label ?? null;
}

export function getPrimarySectorSectionLabel(contract: TemplateContract): string | null {
  const sectorSection = contract.sections.find((section) =>
    section.key === 'sectorSkills' || section.key === 'sectorExperience');
  return sectorSection?.label ?? null;
}

function sanitizeFileToken(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

export function deriveOutputNameFromTemplateContract(
  contract: TemplateContract,
  originalName: string,
  cvName: string,
): string {
  const idMatch = originalName.match(/_(\d{4,})[\s.]/);
  const candidateId = idMatch?.[1] ?? '';
  const firstName = sanitizeFileToken(cvName.split(/\s+/)[0] ?? 'Candidate') || 'Candidate';
  const fullName = sanitizeFileToken(cvName) || firstName;
  const candidateLabel = candidateId ? `Candidate_${candidateId}` : fullName;

  const resolved = contract.output.filenamePattern
    .replaceAll('{candidateId}', candidateId)
    .replaceAll('{firstName}', firstName)
    .replaceAll('{name}', candidateLabel);

  const normalized = resolved
    .replace(/_+/g, '_')
    .replace(/_+\./g, '.')
    .replace(/^\./, 'CV_Profile.');

  return normalized.endsWith('.docx') ? normalized : `${normalized}.docx`;
}

export function validateCvDataAgainstTemplateContract(
  data: Pick<CvData, 'title_line1' | 'title_line2' | 'technicalSkills' | 'sectors' | 'domains' | 'experience' | 'languages' | 'education'>,
  contract: TemplateContract,
): string[] {
  const errors: string[] = [];

  if (data.title_line1.length > contract.header.limits.headlineMaxChars) {
    errors.push(`Header overflow: headline exceeds ${contract.header.limits.headlineMaxChars} characters`);
  }

  if (data.title_line2.length > contract.header.limits.subheadlineMaxChars) {
    errors.push(`Header overflow: subheadline exceeds ${contract.header.limits.subheadlineMaxChars} characters`);
  }

  for (const section of contract.sections.filter((item) => item.required)) {
    if (section.key === 'technicalSkills' && data.technicalSkills.length === 0) {
      errors.push(`Missing required content for section: ${section.label}`);
    }
    if (section.key === 'coreSkills' && data.technicalSkills.length === 0) {
      errors.push(`Missing required content for section: ${section.label}`);
    }
    if (section.key === 'sectorSkills' && data.sectors.length + data.domains.length === 0) {
      errors.push(`Missing required content for section: ${section.label}`);
    }
    if (section.key === 'sectorExperience' && data.sectors.length + data.domains.length === 0) {
      errors.push(`Missing required content for section: ${section.label}`);
    }
    if (section.key === 'experience' && data.experience.length === 0) {
      errors.push(`Missing required content for section: ${section.label}`);
    }
    if (section.key === 'selectedExperience' && data.experience.length === 0) {
      errors.push(`Missing required content for section: ${section.label}`);
    }
    if (section.key === 'additionalExperience' && data.experience.length < 2) {
      errors.push(`Missing required content for section: ${section.label}`);
    }
    if (section.key === 'languages' && data.languages.length === 0) {
      errors.push(`Missing required content for section: ${section.label}`);
    }
    if (section.key === 'education' && data.education.length === 0) {
      errors.push(`Missing required content for section: ${section.label}`);
    }
  }

  return errors;
}
