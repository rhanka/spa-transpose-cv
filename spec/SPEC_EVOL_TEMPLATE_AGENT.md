# SPEC_EVOL_TEMPLATE_AGENT.md — Template system, variantes et agents

> Date : 2026-04-10
> Statut : Draft qualifié

## 1. Objectif

Faire évoluer le moteur actuel, centré sur `scalian-xml.ts`, vers un système piloté par contrat de template afin de :

- supporter plusieurs sociétés de conseil
- produire un template neutre ATS-first
- dériver des variantes visuelles sans réécrire le pipeline
- préparer un agent d'analyse de template DOCX et un agent de scraping de marque

## 2. Constat sur les deux références disponibles

### 2.1 Scalian

Points forts observés :
- header très compact
- sections normalisées
- structure déjà industrialisée dans le code

Limites :
- branding visible dans le footer
- logique de rendu hardcodée dans `scalian-xml.ts`
- pas de contrat explicite séparant structure cible et moteur de rendu

### 2.2 CGI

Constats OOXML extraits :
- palette de marque rouge, `accent1 = #E31937`
- polices dominantes de type `Segoe UI` / `Times New Roman`
- footer de confidentialité et copyright de marque
- structure de CV exécutif mono-colonne, très narrative, riche en blocs d'expérience

Valeur produit :
- bonne référence pour un style consulting senior moins mécanique que Scalian
- utile pour enrichir un format neutre commun

## 3. Template neutre commun visé

Le template neutre commun doit rester :
- mono-colonne
- sans photo
- sans logo
- sans footer juridique de marque
- ATS-safe
- crédible pour des profils seniors de conseil

### 3.1 Structure cible recommandée

Ordre cible :
1. Header
2. Executive summary / profile
3. Core skills
4. Sector experience
5. Selected work experience
6. Additional experience
7. Education & certifications
8. Languages
9. Tools / environment

### 3.2 Header cible

Champs :
- `name`
- `headline`
- `subheadline`
- `years_of_experience`

Contraintes :
- lignes courtes
- pas de logo
- pas de marque client

### 3.3 Principes de rendu

- pas de colonnes Word complexes
- pas de tables critiques pour la lecture ATS
- pas d'élément décoratif nécessaire à la compréhension
- usage strict de tokens de style paramétriques

## 4. Catalogue de variantes faisables en phase 1

Inspirations croisées :
- BetterCV met en avant `Simple`, `Modern`, `One column`, `Professional`, `ATS`
- la phase 1 exclut `With photo`

### 4.1 `ats-core`

- orientation maximalement ATS
- contraste fort
- très peu d'ornement
- espacement serré mais lisible

### 4.2 `consulting-classic`

- synthèse Scalian + CGI
- header exécutif compact
- profil narratif plus riche
- rythme de sections équilibré

### 4.3 `executive-modern`

- hiérarchie visuelle plus premium
- bandeau d'accent discret
- marges et espaces plus généreux
- toujours mono-colonne

### 4.4 `professional-compact`

- densité élevée pour profils seniors
- sections très ramassées
- utile pour CV longs

### 4.5 `brand-accent`

- structure identique à `consulting-classic`
- variation limitée à palette, typo et accents tenant

## 5. Contrat de template

Le système doit converger vers un contrat explicite.

```ts
interface TemplateContract {
  version: 'v1';
  layout: {
    family: 'single-column';
    variant: 'ats-core' | 'consulting-classic' | 'executive-modern' | 'professional-compact' | 'brand-accent';
  };
  header: {
    fields: Array<'name' | 'headline' | 'subheadline' | 'years_of_experience'>;
    limits: {
      headlineMaxChars: number;
      subheadlineMaxChars: number;
    };
  };
  sections: Array<{
    key: string;
    label: string;
    required: boolean;
    repeatable: boolean;
  }>;
  styleTokens: {
    colors: Record<string, string>;
    fonts: Record<string, string | number>;
    spacing: Record<string, string | number>;
  };
  output: {
    filenamePattern: string;
  };
}
```

## 6. Topologie agentique cible

### 6.1 Agents visés

- `cv-extraction-agent`
  - existe déjà dans les faits, extrait les données structurées du CV
- `template-analysis-agent`
  - lit un DOCX cible et produit un `TemplateContract`
- `brand-scraper-agent`
  - dérive un mini design system depuis le site public
- `conductor-qa-agent`
  - valide le document final par rapport au contrat de template

### 6.2 Chaîne cible

1. CV source -> extraction structurée
2. Template DOCX -> `TemplateContract`
3. Site marque -> `BrandTheme`
4. Mapper existant -> rend le CV selon le contrat
5. Conductor -> QA structurelle et documentaire

## 7. Décision framework

### 7.1 Décision

Orientation cible :
- conserver le runtime provider existant

Raisons :
- le streaming de réflexion fonctionne déjà avec les providers en place
- aucune couche runtime supplémentaire n'est nécessaire pour cette tranche
- le multi-provider est déjà couvert par les providers officiels intégrés

### 7.2 Ce qui n'est pas retenu pour cette tranche

- LangChain comme runtime principal
  - trop d'abstraction et de surface
- Agno comme runtime TypeScript
  - documentation et onboarding orientés Python/pip

### 7.3 Stratégie de migration

Phase 1 :
- poser `TemplateContract`
- garder l'orchestrateur actuel
- ajouter les nouveaux agents sous une couche compatible

## 8. Impacts code attendus

Refactors attendus :
- `scalian-xml.ts` -> moteur paramétrique ou nouveau `template-xml.ts`
- séparation claire entre :
  - contrat de template
  - tokens de thème
  - moteur OOXML
  - orchestration agentique

## 9. Tests attendus

- contrat produit valide sur Scalian
- contrat produit valide sur CGI neutralisé
- rendu final sans marque parasite sur `_default`
- mêmes données CV rendables sur plusieurs variantes
- QA automatique détectant :
  - logos restants
  - footer de marque restant
  - dépassement de header
  - section manquante

## 10. Références

Références revérifiées le 2026-04-10 :
- LangChain overview : `https://docs.langchain.com/oss/javascript/langchain/overview`
- Agno docs : `https://docs.agno.com/`
