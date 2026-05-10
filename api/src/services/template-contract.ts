// The template contract logic lives in `@cv-transpose/core`. This file is a
// re-export shim kept for backward compatibility with api/-side callers that
// still import from `./template-contract.js`. New code should import directly
// from `@cv-transpose/core`.
export {
  templateVariantSchema,
  templateHeaderStyleSchema,
  templateSectionStyleSchema,
  templateJobStyleSchema,
  templateHeaderFieldKeySchema,
  templateSectionKeySchema,
  templateRenderingSchema,
  templateContractSchema,
  legacyTemplateSeedSchema,
  legacyThemeSeedSchema,
  buildLegacyTemplateContract,
  ensureTemplateContract,
  getRequiredSectionLabels,
  getPrimaryExperienceSectionLabel,
  getPrimarySectorSectionLabel,
  deriveOutputNameFromTemplateContract,
  validateCvDataAgainstTemplateContract,
} from '@cv-transpose/core';
export type {
  TemplateVariant,
  TemplateSectionKey,
  TemplateHeaderStyle,
  TemplateSectionStyle,
  TemplateJobStyle,
  TemplateRendering,
  TemplateContract,
} from '@cv-transpose/core';
