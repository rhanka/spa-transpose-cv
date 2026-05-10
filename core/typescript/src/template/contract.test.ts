import { describe, it, expect } from 'vitest';
import {
  buildLegacyTemplateContract,
  deriveOutputNameFromTemplateContract,
  ensureTemplateContract,
  getRequiredSectionLabels,
  validateCvDataAgainstTemplateContract,
  type TemplateRendering,
} from './contract.js';

const baseRendering: TemplateRendering = {
  headerStyle: 'ats-minimal',
  sectionStyle: 'rule-caps',
  jobStyle: 'ats-plain',
};

describe('template contract', () => {
  it('buildLegacyTemplateContract keeps required section labels from the provided seed', () => {
    const contract = buildLegacyTemplateContract({
      templateContractVersion: 'v1',
      variant: 'brand-accent',
      rendering: { headerStyle: 'brand-accent', sectionStyle: 'left-accent', jobStyle: 'compact-dense' },
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

    expect(getRequiredSectionLabels(contract)).toEqual([
      'TECHNICAL SKILLS',
      'WORK EXPERIENCE',
      'LANGUAGES SKILLS',
      'EDUCATION/CERTIFICATION',
    ]);
    expect(contract.output.filenamePattern).toBe('Tenant_Profile_{name}.docx');
    expect(contract.layout.variant).toBe('brand-accent');
    expect(contract.rendering.headerStyle).toBe('brand-accent');
  });

  it('ensureTemplateContract rejects a mismatched template variant', () => {
    const contract = buildLegacyTemplateContract({
      templateContractVersion: 'v1',
      variant: 'consulting-classic',
      rendering: { headerStyle: 'professional-classic', sectionStyle: 'centered-rule', jobStyle: 'classic-consulting' },
      template: {
        sections: ['technicalSkills', 'experience'],
      },
    });

    expect(() =>
      ensureTemplateContract({
        templateContractVersion: 'v1',
        variant: 'brand-accent',
        templateContract: contract,
        defaultRendering: { headerStyle: 'brand-accent', sectionStyle: 'left-accent', jobStyle: 'compact-dense' },
      }),
    ).toThrow(/Template contract variant mismatch/);
  });

  it('deriveOutputNameFromTemplateContract sanitizes names and prefers candidate ids when present', () => {
    const contract = buildLegacyTemplateContract({
      templateContractVersion: 'v1',
      variant: 'ats-core',
      rendering: baseRendering,
      template: {
        outputNaming: 'Profile_{name}.docx',
      },
    });

    expect(
      deriveOutputNameFromTemplateContract(contract, 'plain-source.docx', 'Élodie Martin'),
    ).toBe('Profile_Elodie_Martin.docx');
    expect(
      deriveOutputNameFromTemplateContract(contract, 'SCALO_DevOps_138282.pdf', 'Élodie Martin'),
    ).toBe('Profile_Candidate_138282.docx');
  });

  it('validateCvDataAgainstTemplateContract reports header overflow and missing required sections', () => {
    const contract = buildLegacyTemplateContract({
      templateContractVersion: 'v1',
      variant: 'ats-core',
      rendering: baseRendering,
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

    expect(errors.some((error) => error.includes('headline exceeds 40 characters'))).toBe(true);
    expect(errors.some((error) => error.includes('TECHNICAL SKILLS'))).toBe(true);
    expect(errors.some((error) => error.includes('SECTOR-SPECIFIC SKILLS'))).toBe(true);
    expect(errors.some((error) => error.includes('WORK EXPERIENCE'))).toBe(true);
    expect(errors.some((error) => error.includes('LANGUAGES SKILLS'))).toBe(true);
    expect(errors.some((error) => error.includes('EDUCATION/CERTIFICATION'))).toBe(true);
  });
});
