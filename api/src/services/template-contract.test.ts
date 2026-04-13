import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLegacyTemplateContract,
  deriveOutputNameFromTemplateContract,
  ensureTemplateContract,
  getRequiredSectionLabels,
  validateCvDataAgainstTemplateContract,
} from './template-contract.js';

test('buildLegacyTemplateContract keeps required section labels from the provided seed', () => {
  const contract = buildLegacyTemplateContract({
    templateContractVersion: 'v1',
    variant: 'brand-accent',
    theme: {
      accentColor: '#5236AB',
      primaryColor: '#5236AB',
      primaryDark: '#2F2361',
      surfaceSubtle: '#F3F0FF',
      fontHeading: 'Poppins',
      fontBody: 'Inter',
    },
    template: {
      sections: ['technicalSkills', 'experience', 'languages', 'education'],
      outputNaming: 'Tenant_Profile_{name}.docx',
    },
  });

  assert.deepEqual(getRequiredSectionLabels(contract), [
    'TECHNICAL SKILLS',
    'WORK EXPERIENCE',
    'LANGUAGES SKILLS',
    'EDUCATION/CERTIFICATION',
  ]);
  assert.equal(contract.output.filenamePattern, 'Tenant_Profile_{name}.docx');
  assert.equal(contract.layout.variant, 'brand-accent');
});

test('ensureTemplateContract rejects a mismatched template variant', () => {
  const contract = buildLegacyTemplateContract({
    templateContractVersion: 'v1',
    variant: 'consulting-classic',
    template: {
      sections: ['technicalSkills', 'experience'],
    },
  });

  assert.throws(
    () =>
      ensureTemplateContract({
        templateContractVersion: 'v1',
        variant: 'brand-accent',
        templateContract: contract,
      }),
    /Template contract variant mismatch/,
  );
});

test('deriveOutputNameFromTemplateContract sanitizes names and prefers candidate ids when present', () => {
  const contract = buildLegacyTemplateContract({
    templateContractVersion: 'v1',
    variant: 'ats-core',
    template: {
      outputNaming: 'Profile_{name}.docx',
    },
  });

  assert.equal(
    deriveOutputNameFromTemplateContract(contract, 'plain-source.docx', 'Élodie Martin'),
    'Profile_Elodie_Martin.docx',
  );
  assert.equal(
    deriveOutputNameFromTemplateContract(contract, 'SCALO_DevOps_138282.pdf', 'Élodie Martin'),
    'Profile_Candidate_138282.docx',
  );
});

test('validateCvDataAgainstTemplateContract reports header overflow and missing required sections', () => {
  const contract = buildLegacyTemplateContract({
    templateContractVersion: 'v1',
    variant: 'ats-core',
  });

  const errors = validateCvDataAgainstTemplateContract(
    {
      title_line1: 'Cloud transformation and modernization lead',
      title_line2: '',
      technicalSkills: [],
      sectors: [],
      domains: [],
      experience: [],
      languages: [],
      education: [],
    },
    contract,
  );

  assert.ok(errors.some((error) => error.includes('headline exceeds 40 characters')));
  assert.ok(errors.some((error) => error.includes('TECHNICAL SKILLS')));
  assert.ok(errors.some((error) => error.includes('SECTOR-SPECIFIC SKILLS')));
  assert.ok(errors.some((error) => error.includes('WORK EXPERIENCE')));
  assert.ok(errors.some((error) => error.includes('LANGUAGES SKILLS')));
  assert.ok(errors.some((error) => error.includes('EDUCATION/CERTIFICATION')));
});
