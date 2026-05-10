import type { CvData } from './cv-agent.js';
import type { TemplateSectionKey, TemplateVariant } from './template-contract.js';

export type TemplateHeaderStyle =
  | 'ats-minimal'
  | 'simple-clean'
  | 'compact-split'
  | 'modern-band'
  | 'professional-classic'
  | 'brand-accent';

export type TemplateSectionStyle =
  | 'rule-caps'
  | 'subtle-label'
  | 'compact-rule'
  | 'filled-bar'
  | 'classic-band'
  | 'centered-rule'
  | 'left-accent';

export type TemplateJobStyle =
  | 'ats-plain'
  | 'simple-balanced'
  | 'modern-emphasis'
  | 'classic-consulting'
  | 'compact-dense';

export interface TemplateVariantDefinition {
  id: TemplateVariant;
  label: string;
  referenceLabel: string;
  referenceSummary: string;
  previewImagePath: string;
  headerStyle: TemplateHeaderStyle;
  sectionStyle: TemplateSectionStyle;
  jobStyle: TemplateJobStyle;
  styleOverrides: {
    colors?: Record<string, string>;
    fonts?: Record<string, string | number>;
    spacing?: Record<string, string | number>;
  };
  sectionLabelOverrides?: Partial<Record<TemplateSectionKey, string>>;
}

export const TEMPLATE_VARIANT_DEFINITIONS: Record<TemplateVariant, TemplateVariantDefinition> = {
  'ats-core': {
    id: 'ats-core',
    label: 'Aether',
    referenceLabel: 'BetterCV ATS · Aether',
    referenceSummary: 'Gabarit ATS direct, très lisible, avec règles fines et hiérarchie minimale.',
    previewImagePath: '/template-previews/ats-core.png',
    headerStyle: 'ats-minimal',
    sectionStyle: 'rule-caps',
    jobStyle: 'ats-plain',
    styleOverrides: {
      colors: {
        accent: '#1F2937',
        sectionBannerFill: '#FFFFFF',
        sectionBannerText: '#111827',
        headingText: '#111827',
        bodyText: '#111827',
      },
      fonts: {
        heading: 'Liberation Sans Narrow',
        body: 'Liberation Sans Narrow',
      },
      spacing: {
        sectionBeforeTwip: 180,
        sectionAfterTwip: 100,
        lineTwip: 280,
      },
    },
    sectionLabelOverrides: {
      technicalSkills: 'KEY SKILLS',
      coreSkills: 'KEY SKILLS',
      sectorSkills: 'INDUSTRY EXPOSURE',
      sectorExperience: 'INDUSTRY EXPOSURE',
      experience: 'PROFESSIONAL EXPERIENCE',
      selectedExperience: 'SELECTED EXPERIENCE',
      additionalExperience: 'ADDITIONAL EXPERIENCE',
      languages: 'LANGUAGES',
      education: 'EDUCATION',
    },
  },
  'professional-compact': {
    id: 'professional-compact',
    label: 'Celestial',
    referenceLabel: 'BetterCV Simple · Celestial',
    referenceSummary: 'Sidebar douce et dense, sans photo, pour un rendu équilibré et immédiatement lisible.',
    previewImagePath: '/template-previews/professional-compact.png',
    headerStyle: 'compact-split',
    sectionStyle: 'compact-rule',
    jobStyle: 'compact-dense',
    styleOverrides: {
      colors: {
        accent: '#6F6B74',
        sectionBannerFill: '#F2F2F2',
        sectionBannerText: '#4B4E55',
        headingText: '#4B4E55',
        bodyText: '#4B4E55',
        mutedText: '#6F6B74',
      },
      fonts: {
        heading: 'Lato',
        body: 'Lato',
      },
      spacing: {
        sectionBeforeTwip: 120,
        sectionAfterTwip: 70,
        lineTwip: 240,
      },
    },
    sectionLabelOverrides: {
      technicalSkills: 'SKILLS SUMMARY',
      coreSkills: 'SKILLS SUMMARY',
      sectorSkills: 'DOMAIN EXPERTISE',
      sectorExperience: 'DOMAIN EXPERTISE',
      experience: 'EXPERIENCE',
      selectedExperience: 'SELECTED EXPERIENCE',
      additionalExperience: 'OTHER EXPERIENCE',
      languages: 'LANGUAGES',
      education: 'EDUCATION & CERTIFICATIONS',
    },
  },
  'executive-modern': {
    id: 'executive-modern',
    label: 'Horizon',
    referenceLabel: 'BetterCV Modern · Horizon',
    referenceSummary: 'Cadre éditorial plus formel, bordure marquée et composition premium plus posée.',
    previewImagePath: '/template-previews/executive-modern.png',
    headerStyle: 'modern-band',
    sectionStyle: 'subtle-label',
    jobStyle: 'simple-balanced',
    styleOverrides: {
      colors: {
        accent: '#1E2B44',
        sectionBannerFill: '#E9EEF5',
        sectionBannerText: '#1E2B44',
        headingText: '#1F2A38',
        bodyText: '#243042',
        mutedText: '#5B677A',
      },
      fonts: {
        heading: 'Liberation Serif',
        body: 'Liberation Sans',
      },
      spacing: {
        sectionBeforeTwip: 220,
        sectionAfterTwip: 120,
        lineTwip: 290,
      },
    },
    sectionLabelOverrides: {
      technicalSkills: 'CORE STRENGTHS',
      coreSkills: 'CORE STRENGTHS',
      sectorSkills: 'SECTOR EXPERIENCE',
      sectorExperience: 'SECTOR EXPERIENCE',
      experience: 'PROFESSIONAL EXPERIENCE',
      selectedExperience: 'SELECTED EXPERIENCE',
      additionalExperience: 'ADDITIONAL EXPERIENCE',
      languages: 'LANGUAGES',
      education: 'EDUCATION & CERTIFICATIONS',
    },
  },
  'consulting-classic': {
    id: 'consulting-classic',
    label: 'Solstice',
    referenceLabel: 'BetterCV Professional · Solstice',
    referenceSummary: 'Composition centrée et très classique, avec règles fines et tonalité consulting sobre.',
    previewImagePath: '/template-previews/consulting-classic.png',
    headerStyle: 'professional-classic',
    sectionStyle: 'centered-rule',
    jobStyle: 'classic-consulting',
    styleOverrides: {
      colors: {
        accent: '#8A1538',
        sectionBannerFill: '#F3E7EB',
        sectionBannerText: '#6D1130',
        headingText: '#2E1B1F',
        bodyText: '#231F20',
      },
      fonts: {
        heading: 'Liberation Serif',
        body: 'Liberation Serif',
      },
      spacing: {
        sectionBeforeTwip: 240,
        sectionAfterTwip: 140,
        lineTwip: 300,
      },
    },
    sectionLabelOverrides: {
      technicalSkills: 'CORE COMPETENCIES',
      coreSkills: 'CORE COMPETENCIES',
      sectorSkills: 'INDUSTRY EXPERIENCE',
      sectorExperience: 'INDUSTRY EXPERIENCE',
      experience: 'CONSULTING EXPERIENCE',
      selectedExperience: 'SELECTED MISSIONS',
      additionalExperience: 'ADDITIONAL MISSIONS',
      languages: 'LANGUAGES',
      education: 'EDUCATION & CERTIFICATIONS',
    },
  },
  'brand-accent': {
    id: 'brand-accent',
    label: 'Keystone',
    referenceLabel: 'BetterCV Simple · Keystone',
    referenceSummary: 'Bandeau marqué et sidebar structurée, adaptés à une déclinaison société avec accent de marque.',
    previewImagePath: '/template-previews/brand-accent.png',
    headerStyle: 'brand-accent',
    sectionStyle: 'left-accent',
    jobStyle: 'compact-dense',
    styleOverrides: {
      colors: {
        accent: '#0F2137',
        sectionBannerFill: '#E9EEF4',
        sectionBannerText: '#0F2137',
        headingText: '#0F2137',
        bodyText: '#1C2735',
        mutedText: '#607184',
      },
      fonts: {
        heading: 'Liberation Sans',
        body: 'Liberation Sans',
      },
      spacing: {
        sectionBeforeTwip: 120,
        sectionAfterTwip: 70,
        lineTwip: 240,
      },
    },
  },
};

export const TEMPLATE_PREVIEW_SAMPLE_DATA: CvData = {
  name: 'Julien Morel',
  title_line1: 'Chef de projet transformation',
  title_line2: 'PMO, delivery et conduite du changement',
  years: '10',
  technicalSkills: [
    { label: 'Pilotage :', description: 'Programmes transverses, COPIL, arbitrages et priorisation.' },
    { label: 'Delivery :', description: 'Lots, jalons, livrables et engagements.' },
    { label: 'Conduite du changement :', description: 'Bascule, communication et adoption metier.' },
    { label: 'Coordination :', description: 'Equipes metier, SI et partenaires externes.' },
    { label: 'Qualite :', description: 'Risques, plans d action et points de blocage.' },
  ],
  sectors: ['Industrie', 'Services financiers', 'Secteur public'],
  domains: ['Transformation SI', 'PMO & gouvernance', 'Migration applicative'],
  experience: [
    {
      company: 'Axion Conseil - Montreal',
      description: 'Programme de simplification du portefeuille et modernisation du delivery.',
      dates: '01/2023 – present',
      title: 'Chef de projet senior',
      tasks: [
        'Pilote une feuille de route de 14 chantiers avec priorisation trimestrielle.',
        'Anime les comites de suivi et consolide les alertes majeures pour la direction.',
        'Coordonne equipes metier, architecture, exploitation et partenaires externes.',
      ],
      achievements: [
        'Reduction de 22% du retard de livraison sur les lots critiques.',
        'Mise en place d un tableau de bord commun adopte par trois directions.',
      ],
      techEnvironment: 'Jira, Confluence, Power BI, SharePoint',
    },
    {
      company: 'Northbridge Systems - Quebec',
      description: 'Refonte de processus et migration progressive de services internes.',
      dates: '03/2020 – 12/2022',
      title: 'Chef de projet transformation',
      tasks: [
        'Cadre les vagues de migration et securise les prerequis de bascule.',
        'Orchestre les ateliers de cadrage et la recette metier.',
        'Suit risques, dependances et budgets avec les responsables de domaine.',
      ],
      achievements: [
        'Livraison de 6 vagues sans interruption critique de service.',
        'Reduction du temps de preparation des bascules grace a un kit projet commun.',
      ],
      techEnvironment: 'MS Project, Excel, ServiceNow, Teams',
    },
    {
      company: 'Civis Tech - Montreal',
      description: 'PMO transverse sur plusieurs projets de numerisation de parcours internes.',
      dates: '06/2018 – 02/2020',
      title: 'PMO / chef de projet',
      tasks: [
        'Standardise les rituels projet, les indicateurs et les templates de pilotage.',
        'Accompagne les responsables de chantier sur les arbitrages capacitaires.',
        'Prepare les supports de gouvernance et la communication aux parties prenantes.',
      ],
      achievements: [
        'Harmonisation des reportings sur un portefeuille de 9 projets.',
      ],
      techEnvironment: 'PowerPoint, Excel, SharePoint, Visio',
    },
    {
      company: 'Transitia Services - Quebec',
      description: 'Coordination d un programme de deploiement applicatif sur plusieurs sites.',
      dates: '01/2016 – 05/2018',
      title: 'Coordinateur projets SI',
      tasks: [
        'Prepare les jalons de deploiement, les supports de comite et les plans d action.',
        'Securise la coordination entre metier, support de proximite et fournisseurs.',
        'Suit les incidents de bascule et consolide les retours d experience.',
      ],
      achievements: [
        'Mise en service progressive sur 11 sites avec calendrier stabilise.',
      ],
      techEnvironment: 'MS Project, Excel, SharePoint, Service Desk',
    },
  ],
  languages: [
    { label: 'Francais :', level: 'Bilingue' },
    { label: 'Anglais :', level: 'Professionnel' },
  ],
  education: [
    { year: '2015', description: 'Master management de projet - ESG UQAM' },
    { year: '2013', description: 'Licence administration des affaires - Universite Laval' },
  ],
  attention_cv: '- **Preview** - Donnees de demonstration pour la bibliotheque de variantes',
};

export function getTemplateVariantDefinition(variant: TemplateVariant): TemplateVariantDefinition {
  return TEMPLATE_VARIANT_DEFINITIONS[variant];
}
