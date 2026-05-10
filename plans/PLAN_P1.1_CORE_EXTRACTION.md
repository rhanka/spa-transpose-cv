# P1.1 — Core extraction (TS port + shared spec) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract le pipeline CV-Transpose dans un dossier `core/` du monorepo, avec un port TypeScript consommé par le shell web via npm workspace, un manifeste partagé (`core/spec/`) source de vérité du comportement, et un retrait de la customisation template end-user (galerie BetterCV, multi-variantes) — chaque tenant n'a plus qu'un seul template d'entreprise.

**Architecture:** Monorepo npm workspaces avec `core/typescript/` (package `@cv-transpose/core`) consommé par `api/`, `core/spec/` (sources : prompts, workflow, validation rules, JSON Schema), `core/fixtures/` + `core/golden/` pour les tests d'équivalence (préparés ici, exécutés en P1.2). Le shell `api/` devient un fin orchestrateur qui appelle `transpose()` du core.

**Tech Stack:** TypeScript, npm workspaces, Vitest (tests), ajv (JSON Schema), jszip + xmldom + fast-xml-parser (OOXML, déjà en place), esbuild (bundling, déjà en place), Docker Compose (toute commande passe par container, contrainte projet).

---

## Preconditions

- Le plan **exécute depuis une nouvelle branche `wip/p1.1-core-extraction` créée à partir de `wip/saturation-and-celestial`** (pas depuis `master` qui n'a pas le code multi-tenant). Les deux branches WIP n'ont pas d'ancêtre commun, ne pas tenter de merge.
- Toute commande `npm` / `node` / `npx` / `tsc` / `vitest` est exécutée **dans un container Docker** via `docker compose exec` ou `docker compose run --rm` (contrainte projet, jamais de Node natif sur l'hôte).
- Le fix saturation LibreOffice est **déjà appliqué** dans la baseline `wip/saturation-and-celestial` (orchestrator.ts + text-extractor.ts + Dockerfile + docker-compose).
- Les fichiers untracked locaux (`Scalian_Template.docx`, `outputs/`, `e2e/`, etc.) sont **du scratch hors-périmètre** et restent untracked.
- Aucune fixture ne doit contenir de PII réelle (consigne historique : tous les CVs sont fictifs, anonymes).

## Avant / après — vue arborescente

**Avant** (baseline `wip/saturation-and-celestial`) :
```
api/src/services/
  ├── orchestrator.ts          # extraction + render + validation, mono-package
  ├── cv-agent.ts              # prompt LLM extraction
  ├── docx-tools.ts            # unpack/pack/validate DOCX
  ├── docx-reader.ts           # lecture DOCX vers texte
  ├── docx-tooling.ts          # outils DOCX TS
  ├── font-embedding.ts        # embedding OOXML fonts Lato
  ├── scalian-xml.ts           # ancien moteur Scalian-only
  ├── template-contract.ts     # contrat template
  ├── template-xml.ts          # rendu OOXML multi-variantes (À SIMPLIFIER)
  ├── template-preview.ts      # rendu PNG galerie (À SUPPRIMER)
  ├── template-variant-catalog.ts  # catalogue variantes BetterCV (À SUPPRIMER)
  ├── template-analysis-agent.ts   # analyse DOCX → manifeste
  ├── template-generation-prompt.ts# prompt génération template
  ├── tenant-config.ts / tenant-admin.ts
  ├── text-extractor.ts        # PDF/DOCX → texte
  ├── llm/                     # adapters multi-provider
  └── ...
```

**Après** (cible P1.1) :
```
core/
  ├── spec/
  │   ├── prompts/extract-cv.md          # prompt LLM, source de vérité
  │   ├── prompts/qa-conductor.md        # prompt validation conducteur
  │   ├── workflow.yaml                  # étapes du pipeline
  │   ├── validation-rules.json          # règles d'alignement
  │   ├── template-manifest-v1.json      # JSON Schema du manifeste tenant
  │   └── normalize-docx.md              # pseudocode normalisation pour eq-tests
  ├── typescript/
  │   ├── package.json                   # name @cv-transpose/core
  │   ├── tsconfig.json
  │   └── src/
  │       ├── index.ts                   # exports publics + transpose()
  │       ├── types.ts                   # InputFile, BrandTokens, TransposeInput, ...
  │       ├── llm.ts                     # interface LlmProvider
  │       ├── docx/
  │       │   ├── tools.ts               # ex api/src/services/docx-tools.ts
  │       │   ├── reader.ts              # ex api/src/services/docx-reader.ts
  │       │   └── font-embedding.ts      # ex api/src/services/font-embedding.ts
  │       ├── extract/
  │       │   └── text.ts                # ex api/src/services/text-extractor.ts
  │       ├── template/
  │       │   ├── contract.ts            # ex api/src/services/template-contract.ts
  │       │   ├── manifest.ts            # validation JSON Schema des manifestes tenant
  │       │   └── render.ts              # ex template-xml.ts SIMPLIFIÉ (un seul rendu)
  │       ├── validate/
  │       │   └── page1.ts               # ex orchestrator.ts validatePage1WithPdf
  │       └── transpose.ts               # fonction publique
  ├── fixtures/
  │   ├── cv-001-junior-pm.pdf
  │   ├── cv-001-junior-pm.expected-extraction.json
  │   ├── cv-002-senior-archi.docx
  │   ├── cv-002-senior-archi.expected-extraction.json
  │   └── cv-003-multi-langue.pdf
  └── golden/
      ├── cv-001-junior-pm.scalian.docx
      ├── cv-002-senior-archi.scalian.docx
      └── cv-003-multi-langue.scalian.docx
api/
  ├── src/
  │   ├── routes/                        # inchangé
  │   ├── services/
  │   │   ├── orchestrator.ts            # APPELLE core.transpose(), reste mince
  │   │   ├── tenant-config.ts           # garde
  │   │   ├── tenant-admin.ts            # garde
  │   │   ├── admin-auth.ts              # garde
  │   │   ├── brand-scraper-agent.ts     # garde
  │   │   ├── crypto.ts                  # garde
  │   │   ├── purge.ts                   # garde
  │   │   ├── session-manager.ts         # garde
  │   │   ├── template-analysis-agent.ts # garde (utilisé par admin)
  │   │   ├── template-generation-prompt.ts # garde
  │   │   ├── event-bus.ts               # garde
  │   │   └── llm/                       # garde (adapters concrets)
  │   └── ...
  └── package.json                       # ajoute "@cv-transpose/core" via workspace
package.json                             # nouveau, racine workspaces
ui/src/lib/pages/UploadPage.svelte       # gallery retirée
```

Fichiers **supprimés** au cours du plan :
- `api/src/services/scalian-xml.ts` (déprécié, plus consommé après simplification)
- `api/src/services/template-variant-catalog.ts` (catalogue galerie)
- `api/src/services/template-preview.ts` (rendu PNG galerie)
- `api/src/services/template-xml.ts` (déplacé dans core et simplifié — variantes retirées)
- `api/src/services/template-contract.ts` (déplacé dans core)
- `api/src/services/docx-tooling.ts` (déplacé dans core, fusionné avec docx/tools.ts)
- `api/src/services/docx-tools.ts` / `docx-reader.ts` / `font-embedding.ts` / `text-extractor.ts` (déplacés)
- `ui/static/template-previews/` (toute la galerie de previews PNG)

---

## Tasks

### Task 1 — Préparer la branche d'exécution

**Files:**
- Branche : `wip/p1.1-core-extraction` créée depuis `wip/saturation-and-celestial`

- [ ] **Step 1: Créer la branche d'exécution**

```bash
git fetch origin
git checkout -b wip/p1.1-core-extraction origin/wip/saturation-and-celestial
```

- [ ] **Step 2: Vérifier le baseline**

```bash
ls api/src/services/template-xml.ts api/src/services/font-embedding.ts \
   api/src/services/tenant-config.ts >/dev/null && echo OK
```
Expected: `OK`

- [ ] **Step 3: Push initial pour tracking**

```bash
git push -u origin wip/p1.1-core-extraction
```

### Task 2 — Racine npm workspaces

**Files:**
- Create: `/package.json` (racine, **attention** : remplace tout `package.json` racine untracked existant — vérifier avec `ls package.json` et déplacer toute version locale aux scratch hors-git si nécessaire)
- Create: `/tsconfig.base.json` (config TS partagée)

- [ ] **Step 1: Vérifier qu'aucun `/package.json` tracked n'existe**

```bash
git ls-files package.json
```
Expected: vide. Si non-vide, abandonner et arbitrer avec utilisateur.

- [ ] **Step 2: Si un `package.json` untracked existe localement, le déplacer**

```bash
[ -f package.json ] && [ ! "$(git ls-files package.json)" ] && \
  mv package.json package.json.local-scratch
```

- [ ] **Step 3: Écrire la racine workspace**

`/package.json` :
```json
{
  "name": "spa-transpose-cv-monorepo",
  "private": true,
  "workspaces": ["api", "ui", "core/typescript"]
}
```

- [ ] **Step 4: Écrire la base TS partagée**

`/tsconfig.base.json` :
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": false
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.base.json
git commit -m "chore: bootstrap monorepo npm workspaces (api, ui, core/typescript)"
```

### Task 3 — Squelette `core/typescript/`

**Files:**
- Create: `core/typescript/package.json`
- Create: `core/typescript/tsconfig.json`
- Create: `core/typescript/src/index.ts` (exports placeholder)
- Create: `core/typescript/vitest.config.ts`
- Create: `core/typescript/src/_smoke.test.ts`

- [ ] **Step 1: Écrire le package**

`core/typescript/package.json` :
```json
{
  "name": "@cv-transpose/core",
  "version": "0.1.0-dev",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "ajv": "^8.17.1",
    "fast-xml-parser": "^4.4.0",
    "jszip": "^3.10.1",
    "@xmldom/xmldom": "^0.8.11"
  },
  "devDependencies": {
    "vitest": "^2.0.0",
    "typescript": "^5.9.3",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: tsconfig**

`core/typescript/tsconfig.json` :
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Smoke export**

`core/typescript/src/index.ts` :
```ts
export const CORE_VERSION = '0.1.0-dev';
```

- [ ] **Step 4: Vitest config + test smoke**

`core/typescript/vitest.config.ts` :
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node' } });
```

`core/typescript/src/_smoke.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { CORE_VERSION } from './index.js';

describe('core smoke', () => {
  it('exposes a version constant', () => {
    expect(CORE_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
```

- [ ] **Step 5: Installer + faire passer le smoke test (dans Docker)**

```bash
docker compose run --rm api npm install
docker compose run --rm api npx -w @cv-transpose/core vitest run
```
Expected: 1 test pass.

- [ ] **Step 6: Commit**

```bash
git add core/typescript package-lock.json
git commit -m "chore(core): scaffold @cv-transpose/core TS package with vitest smoke"
```

### Task 4 — Squelette `core/spec/`, `core/fixtures/`, `core/golden/`

**Files:**
- Create: `core/spec/.gitkeep`
- Create: `core/fixtures/.gitkeep`
- Create: `core/golden/.gitkeep`
- Create: `core/README.md` décrivant le rôle du dossier

- [ ] **Step 1: Créer la structure**

```bash
mkdir -p core/spec core/fixtures core/golden
touch core/spec/.gitkeep core/fixtures/.gitkeep core/golden/.gitkeep
```

- [ ] **Step 2: Écrire `core/README.md`**

```markdown
# core/ — moteur CV Transpose partagé

Source de vérité du comportement consommée par les trois shells (web,
agent MS Copilot, agent Gemini Enterprise).

- `spec/` : prompts, workflow, validation rules, JSON Schema. Source de
  vérité du comportement.
- `typescript/` : port TS consommé par le shell web via npm workspace.
- `python/` : (à venir P1.2) port Python pour les agents marketplace.
- `fixtures/` + `golden/` : CVs canoniques et sorties attendues pour les
  tests d'équivalence.

Contrats partagés : voir `spec/SPEC_EVOL_MULTI_MARKETPLACE_INTERFACES.md`.

Versioning : tag Git annoté `core-vX.Y.Z` du monorepo.
```

- [ ] **Step 3: Commit**

```bash
git add core/
git commit -m "chore(core): scaffold spec/fixtures/golden directories with README"
```

### Task 5 — JSON Schema `template-manifest-v1.json`

**Files:**
- Create: `core/spec/template-manifest-v1.json`
- Test: `core/typescript/src/template/manifest.test.ts` (futur)

- [ ] **Step 1: Écrire le schéma (copie depuis SPEC_EVOL_MULTI_MARKETPLACE_INTERFACES.md §2.1)**

`core/spec/template-manifest-v1.json` : copier le JSON complet de la section 2.1 du fichier `spec/SPEC_EVOL_MULTI_MARKETPLACE_INTERFACES.md`.

- [ ] **Step 2: Test : valide un manifeste minimal**

`core/typescript/src/template/manifest.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import schema from '../../../../core/spec/template-manifest-v1.json' assert { type: 'json' };

const minimal = {
  version: '1.0',
  tenantKey: 'direct:test',
  naming: '{name}_CV.docx',
  header: {
    nameSlot: { paragraphIndex: 0, runIndex: 0 },
    titleLine1Slot: { paragraphIndex: 1, runIndex: 0 },
    titleLine2Slot: { paragraphIndex: 1, runIndex: 1 }
  },
  sections: [
    { id: 'exp', kind: 'experiences', label: 'Experience' }
  ]
};

describe('template-manifest-v1', () => {
  it('accepts a minimal manifest', () => {
    const ajv = new Ajv();
    const validate = ajv.compile(schema);
    expect(validate(minimal)).toBe(true);
  });

  it('rejects an unknown section.kind', () => {
    const bad = { ...minimal, sections: [{ id: 'x', kind: 'unknown', label: 'X' }] };
    const ajv = new Ajv();
    const validate = ajv.compile(schema);
    expect(validate(bad)).toBe(false);
  });
});
```

- [ ] **Step 3: Run et faire passer**

```bash
docker compose run --rm api npx -w @cv-transpose/core vitest run manifest
```
Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add core/spec/template-manifest-v1.json core/typescript/src/template/manifest.test.ts
git commit -m "feat(core): add template-manifest-v1 JSON Schema with minimal validation"
```

### Task 6 — Validateur `manifest.ts`

**Files:**
- Create: `core/typescript/src/template/manifest.ts`

- [ ] **Step 1: Écrire l'API du validateur (test-first)**

Étendre `core/typescript/src/template/manifest.test.ts` :
```ts
import { validateTemplateManifest } from './manifest.js';

it('validateTemplateManifest returns ok+manifest on valid input', () => {
  const r = validateTemplateManifest(minimal);
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.manifest.tenantKey).toBe('direct:test');
});

it('validateTemplateManifest returns ok=false with errors on invalid', () => {
  const r = validateTemplateManifest({ broken: true });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.errors.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run, expected fail**

```bash
docker compose run --rm api npx -w @cv-transpose/core vitest run manifest
```
Expected: tests imports échouent.

- [ ] **Step 3: Implémenter**

`core/typescript/src/template/manifest.ts` :
```ts
import Ajv from 'ajv';
import schema from '../../../../core/spec/template-manifest-v1.json' assert { type: 'json' };

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);

export interface TemplateManifest {
  version: '1.0';
  tenantKey: string;
  naming: string;
  header: {
    nameSlot: Slot;
    titleLine1Slot: Slot;
    titleLine2Slot: Slot;
  };
  sections: Section[];
  validationRulesRef?: string;
}

export interface Slot { paragraphIndex: number; runIndex: number; maxChars?: number; }
export interface Section {
  id: string;
  kind: 'experiences' | 'education' | 'skills' | 'languages' | 'certifications' | 'narrative';
  label: string;
  anchorParagraphIndex?: number;
  maxItems?: number;
  itemTemplateRef?: string;
}

export type ValidationResult =
  | { ok: true; manifest: TemplateManifest }
  | { ok: false; errors: string[] };

export function validateTemplateManifest(input: unknown): ValidationResult {
  if (validate(input)) return { ok: true, manifest: input as TemplateManifest };
  return {
    ok: false,
    errors: (validate.errors ?? []).map(e => `${e.instancePath} ${e.message}`)
  };
}
```

- [ ] **Step 4: Run, expected pass**

```bash
docker compose run --rm api npx -w @cv-transpose/core vitest run manifest
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add core/typescript/src/template/manifest.ts core/typescript/src/template/manifest.test.ts
git commit -m "feat(core): add validateTemplateManifest validator over v1 schema"
```

### Task 7 — Workflow YAML

**Files:**
- Create: `core/spec/workflow.yaml`

- [ ] **Step 1: Décrire le pipeline existant**

`core/spec/workflow.yaml` :
```yaml
version: 1
description: Pipeline CV Transpose, source de vérité du comportement.
steps:
  - id: extract-text
    description: Extrait le texte brut du CV source (PDF via pdftotext, DOCX via docx-reader).
    inputs: [file]
    outputs: [raw_text]
    fails_loud: true

  - id: extract-cv
    description: Appel LLM pour mapper le texte brut vers un JSON structuré conforme au schéma de profil.
    prompt_ref: prompts/extract-cv.md
    inputs: [raw_text, tenant_brand]
    outputs: [profile_json]
    fails_loud: true
    retries: 1

  - id: render-docx
    description: Construit le DOCX OOXML à partir du profil et du manifeste de template.
    inputs: [profile_json, template_manifest, base_docx, brand]
    outputs: [docx_bytes]
    fails_loud: true

  - id: validate-page1
    description: Vérifie que les sections critiques tiennent en page 1 et que les contraintes d'alignement sont respectées.
    rules_ref: validation-rules.json
    inputs: [docx_bytes, template_manifest]
    outputs: [alignment_report]
    fails_loud: false

  - id: qa-conductor
    description: (Optionnel, mode session) Relecture LLM "conducteur" pour signaler les attentions traduction et fidélité.
    prompt_ref: prompts/qa-conductor.md
    inputs: [profile_json, alignment_report]
    outputs: [warnings]
    fails_loud: false
    retries: 0
```

- [ ] **Step 2: Sanity check (parse YAML dans un test)**

`core/typescript/src/workflow.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

describe('workflow.yaml', () => {
  it('parses and lists 5 steps', () => {
    const raw = readFileSync(new URL('../../../core/spec/workflow.yaml', import.meta.url), 'utf8');
    const w = parse(raw);
    expect(w.version).toBe(1);
    expect(w.steps.length).toBe(5);
    expect(w.steps.map((s: any) => s.id)).toEqual([
      'extract-text', 'extract-cv', 'render-docx', 'validate-page1', 'qa-conductor'
    ]);
  });
});
```

Ajouter `yaml` aux deps de `core/typescript/package.json`.

- [ ] **Step 3: Run + commit**

```bash
docker compose run --rm api npm install
docker compose run --rm api npx -w @cv-transpose/core vitest run workflow
git add core/spec/workflow.yaml core/typescript/src/workflow.test.ts \
        core/typescript/package.json package-lock.json
git commit -m "feat(core): add workflow.yaml describing the 5-step pipeline"
```

### Task 8 — Validation rules JSON

**Files:**
- Create: `core/spec/validation-rules.json`

- [ ] **Step 1: Écrire les règles existantes (extraites de `orchestrator.ts::validatePage1WithPdf` et `template-contract.ts`)**

`core/spec/validation-rules.json` :
```json
{
  "version": "1.0",
  "rulesets": {
    "default": {
      "page1": {
        "experienceSectionMustNotAppearOnPage1": true,
        "sectorSectionMustAppearOnPage1": true,
        "matchMode": "case-insensitive-substring"
      },
      "header": {
        "titleLine1MaxChars": 25,
        "titleLine2MaxChars": 25
      }
    }
  }
}
```

- [ ] **Step 2: Test smoke (le fichier parse en JSON valide)**

`core/typescript/src/validate/rules.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import rules from '../../../../core/spec/validation-rules.json' assert { type: 'json' };

describe('validation-rules', () => {
  it('exposes a default ruleset', () => {
    expect(rules.rulesets.default.page1.experienceSectionMustNotAppearOnPage1).toBe(true);
    expect(rules.rulesets.default.header.titleLine1MaxChars).toBe(25);
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
docker compose run --rm api npx -w @cv-transpose/core vitest run rules
git add core/spec/validation-rules.json core/typescript/src/validate/rules.test.ts
git commit -m "feat(core): add validation-rules.json with the existing default ruleset"
```

### Task 9 — Prompts (extract du LLM agent)

**Files:**
- Create: `core/spec/prompts/extract-cv.md`
- Create: `core/spec/prompts/qa-conductor.md`

- [ ] **Step 1: Extraire le prompt extraction depuis `api/src/services/cv-agent.ts`**

Lire `api/src/services/cv-agent.ts`, copier le **system prompt complet** dans `core/spec/prompts/extract-cv.md` en intercalant les marqueurs YAML frontmatter :
```markdown
---
id: extract-cv
version: 1.0
purpose: |
  Extraire un CV (texte brut) vers un JSON structuré conforme au schéma de profil
  attendu par le moteur de rendu.
---

# System prompt

(coller ici le prompt système exact du fichier api/src/services/cv-agent.ts,
verbatim, sans paraphrase)

# User prompt template

(coller ici le user prompt template, avec les placeholders {raw_text} et {brand_hint})
```

- [ ] **Step 2: Idem pour le QA conducteur**

Si `api/src/services/orchestrator.ts` ou `cv-agent.ts` contient un second prompt pour la validation conducteur, le copier dans `core/spec/prompts/qa-conductor.md`. Si pas de second prompt aujourd'hui, créer le fichier vide avec frontmatter et noter : "À implémenter — la première version utilisera le retry du même prompt extract-cv".

- [ ] **Step 3: Smoke test (les fichiers existent et parsent)**

`core/typescript/src/prompts.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('prompts', () => {
  it('extract-cv has frontmatter + content', () => {
    const raw = readFileSync(new URL('../../../core/spec/prompts/extract-cv.md', import.meta.url), 'utf8');
    expect(raw).toMatch(/^---/);
    expect(raw.length).toBeGreaterThan(200);
  });
  it('qa-conductor file exists', () => {
    const raw = readFileSync(new URL('../../../core/spec/prompts/qa-conductor.md', import.meta.url), 'utf8');
    expect(raw).toMatch(/^---/);
  });
});
```

- [ ] **Step 4: Run + commit**

```bash
docker compose run --rm api npx -w @cv-transpose/core vitest run prompts
git add core/spec/prompts core/typescript/src/prompts.test.ts
git commit -m "feat(core): extract LLM prompts to core/spec/prompts/ as source of truth"
```

### Task 10 — `core/spec/normalize-docx.md`

**Files:**
- Create: `core/spec/normalize-docx.md`

- [ ] **Step 1: Pseudocode normalisation OOXML**

`core/spec/normalize-docx.md` :
```markdown
# normalize_docx — pseudocode partagé

Helper utilisé par les tests d'équivalence pour comparer un DOCX produit
par le port TS et un DOCX produit par le port Python. Doit être
implémenté dans chaque port avec le **même comportement bit-pour-bit**.

## Étapes

1. Décompresser le DOCX (zip).
2. Pour chaque entrée XML (`word/document.xml`, `word/styles.xml`,
   `word/header*.xml`, etc.) :
   a. Parser en arbre XML.
   b. Trier les attributs alphabétiquement sur chaque noeud.
   c. Supprimer les attributs non-déterministes :
      - `w:rsidR`, `w:rsidRPr`, `w:rsidRDefault`, `w:rsidP`, `w:rsidTr`
      - `wp14:editId`, `wp:docPr/@id`
      - tout `*Id` numérique aléatoire dans `pkg:` ou `docId`.
   d. Zéroïser les `<dcterms:created>`, `<dcterms:modified>`,
      `<cp:lastModifiedBy>` dans `docProps/core.xml`.
   e. Sérialiser avec un formatter déterministe (indentation 2 espaces,
      pas de retour à la ligne supplémentaire dans les balises vides).
3. Retourner un dict `{ entryName: normalizedXmlString }` ; les binaires
   (`media/`, `embeddings/`) sont conservés tels quels et comparés en
   hash SHA-256.

## Tests d'équivalence

- Égalité stricte sur le dict produit par le port TS et le port Python
  pour la même fixture.
- En cas de divergence, le diff doit être lisible (XPath + ligne).
```

- [ ] **Step 2: Commit**

```bash
git add core/spec/normalize-docx.md
git commit -m "doc(core): add normalize-docx pseudocode shared between ports"
```

### Task 11 — Types publics (Contract 1)

**Files:**
- Create: `core/typescript/src/types.ts`

- [ ] **Step 1: Écrire les types**

Copier verbatim les définitions TypeScript de la section 1.1 de `spec/SPEC_EVOL_MULTI_MARKETPLACE_INTERFACES.md` dans `core/typescript/src/types.ts` (`InputFile`, `BrandTokens`, `Persistence`, `LlmProvider`, `TemplateAssets`, `TransposeInput`, `DetectedFields`, `AlignmentReport`, `TransposedCv`, `TransposeOutput`).

Réexporter `TemplateManifest` depuis `./template/manifest.js`.

- [ ] **Step 2: Test : compilation propre**

```bash
docker compose run --rm api npx -w @cv-transpose/core tsc --noEmit
```
Expected: 0 erreur.

- [ ] **Step 3: Commit**

```bash
git add core/typescript/src/types.ts
git commit -m "feat(core): add public types per Contract 1 (InputFile, TransposeInput, ...)"
```

### Task 12 — Interface `LlmProvider` dans core

**Files:**
- Create: `core/typescript/src/llm.ts`

- [ ] **Step 1: Test (mock LlmProvider)**

`core/typescript/src/llm.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import type { LlmProvider } from './llm.js';

describe('LlmProvider', () => {
  it('a mock provider can be passed where LlmProvider is expected', async () => {
    const mock: LlmProvider = {
      complete: async () => ({ text: 'hello', usage: { inputTokens: 1, outputTokens: 1 } })
    };
    const r = await mock.complete({ systemPrompt: 's', userPrompt: 'u' });
    expect(r.text).toBe('hello');
  });
});
```

- [ ] **Step 2: Implémenter**

`core/typescript/src/llm.ts` :
```ts
export interface LlmCompleteArgs {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmCompleteResult {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface LlmProvider {
  complete(args: LlmCompleteArgs): Promise<LlmCompleteResult>;
}
```

- [ ] **Step 3: Run + commit**

```bash
docker compose run --rm api npx -w @cv-transpose/core vitest run llm
git add core/typescript/src/llm.ts core/typescript/src/llm.test.ts
git commit -m "feat(core): add LlmProvider interface (provider-neutral abstraction)"
```

### Task 13 — Adapter `LlmProvider` côté api/

**Files:**
- Create: `api/src/services/llm/adapt-to-core.ts`
- Test: `api/src/services/llm/adapt-to-core.test.ts`

- [ ] **Step 1: Test (le registry api/ peut fournir un LlmProvider conforme à core)**

`api/src/services/llm/adapt-to-core.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { adaptRegistryToCoreProvider } from './adapt-to-core.js';

describe('adaptRegistryToCoreProvider', () => {
  it('returns an object with a complete() method', () => {
    const adapter = adaptRegistryToCoreProvider({ provider: 'mock' });
    expect(typeof adapter.complete).toBe('function');
  });
});
```

- [ ] **Step 2: Implémenter en wrappant `api/src/services/llm/registry.ts` existant**

`api/src/services/llm/adapt-to-core.ts` :
```ts
import type { LlmProvider } from '@cv-transpose/core';
import { resolveProvider } from './registry.js';

export function adaptRegistryToCoreProvider(opts: { provider: string }): LlmProvider {
  return {
    async complete(args) {
      const concrete = resolveProvider(opts.provider);
      const r = await concrete.complete({
        system: args.systemPrompt,
        user: args.userPrompt,
        maxTokens: args.maxTokens,
        temperature: args.temperature
      });
      return {
        text: r.text,
        usage: r.usage ? { inputTokens: r.usage.input, outputTokens: r.usage.output } : undefined
      };
    }
  };
}
```

Adapter les noms exacts si `registry.ts` expose une autre signature (relire le fichier en début de Step 2 et ajuster).

- [ ] **Step 3: Run + commit**

```bash
make typecheck-api
docker compose run --rm api npx vitest run adapt-to-core
git add api/src/services/llm/adapt-to-core.ts api/src/services/llm/adapt-to-core.test.ts
git commit -m "feat(api): adapt LLM registry to core's LlmProvider interface"
```

### Task 14 — Déplacer les helpers DOCX dans `core/`

**Files:**
- Move: `api/src/services/docx-tools.ts` → `core/typescript/src/docx/tools.ts`
- Move: `api/src/services/docx-reader.ts` → `core/typescript/src/docx/reader.ts`
- Move: `api/src/services/font-embedding.ts` → `core/typescript/src/docx/font-embedding.ts`
- Merge: `api/src/services/docx-tooling.ts` dans `core/typescript/src/docx/tools.ts` (les méthodes utiles pour le pipeline ; le reste — preview/proof scripts — supprimé en Task 19)

- [ ] **Step 1: Déplacer les fichiers**

```bash
git mv api/src/services/docx-tools.ts core/typescript/src/docx/tools.ts
git mv api/src/services/docx-reader.ts core/typescript/src/docx/reader.ts
git mv api/src/services/font-embedding.ts core/typescript/src/docx/font-embedding.ts
```

- [ ] **Step 2: Mettre à jour les imports internes**

Dans les 3 fichiers déplacés, corriger tout import relatif (`../config/logger.js` devient `../...` selon nouveau chemin). Pour la phase MVP : remplacer les imports vers `api/src/config/logger.js` par un logger basique injecté ou un `console`-fallback dans `core/`. Préférer une fonction `core/src/util/log.ts` minimal :

`core/typescript/src/util/log.ts` :
```ts
export interface CoreLogger {
  info(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
}
export const defaultLogger: CoreLogger = {
  info: (m, c) => console.log(JSON.stringify({ level: 'info', msg: m, ...c })),
  error: (m, c) => console.error(JSON.stringify({ level: 'error', msg: m, ...c }))
};
```

Dans les 3 fichiers déplacés, remplacer `import { logger } from '../config/logger.js'` par `import { defaultLogger as logger } from '../util/log.js'`.

- [ ] **Step 3: Réexporter depuis `core/typescript/src/index.ts`**

Ajouter à `core/typescript/src/index.ts` :
```ts
export * from './docx/tools.js';
export * from './docx/reader.js';
export * from './docx/font-embedding.js';
```

- [ ] **Step 4: Réexposer pour `api/` (re-export shim transitoire)**

`api/src/services/docx-tools.ts` (nouveau, mince) :
```ts
export * from '@cv-transpose/core';
```

Idem pour `api/src/services/docx-reader.ts` et `api/src/services/font-embedding.ts` — chaque fichier devient une ligne `export * from '@cv-transpose/core';`. Ces shims seront supprimés en Task 30 quand tous les call-sites api/ seront migrés.

- [ ] **Step 5: Typecheck et tests**

```bash
make typecheck-api
docker compose run --rm api npx -w @cv-transpose/core vitest run
```
Expected: pas de régression de typecheck. Si erreurs : ajuster les imports sortants ou les shims.

- [ ] **Step 6: Commit**

```bash
git add core/typescript/src/docx core/typescript/src/util core/typescript/src/index.ts \
        api/src/services/docx-tools.ts api/src/services/docx-reader.ts api/src/services/font-embedding.ts
git commit -m "refactor: move DOCX helpers from api/ to @cv-transpose/core (with re-export shims)"
```

### Task 15 — Fusionner `docx-tooling.ts` (parties pipeline) dans core

**Files:**
- Modify: `api/src/services/docx-tooling.ts` (lire pour identifier ce qui sert au pipeline vs ce qui est preview/proof)

- [ ] **Step 1: Lire `docx-tooling.ts` et catégoriser**

Identifier dans le fichier les fonctions utilisées par `orchestrator.ts` ou `template-xml.ts` (à garder, à déplacer dans core) vs les fonctions utilisées seulement par les scripts de preview / make targets (à laisser temporairement dans api/, supprimées en Task 19).

```bash
grep -rn 'from.*docx-tooling' api/src/services/ api/scripts/ 2>/dev/null
```

- [ ] **Step 2: Déplacer les fonctions pipeline**

Pour chaque fonction utilisée par le pipeline (extract / render / validate), la déplacer dans `core/typescript/src/docx/tools.ts` (concaténer ou importer-réexporter selon ce qui est plus propre). Fonctions preview/proof : laisser en place dans `api/src/services/docx-tooling.ts`.

- [ ] **Step 3: Typecheck**

```bash
make typecheck-api
```

- [ ] **Step 4: Commit**

```bash
git add api/src/services/docx-tooling.ts core/typescript/src/docx/tools.ts
git commit -m "refactor: move docx-tooling pipeline helpers into core, keep preview helpers in api/"
```

### Task 16 — Déplacer `text-extractor.ts` dans core

**Files:**
- Move: `api/src/services/text-extractor.ts` → `core/typescript/src/extract/text.ts`

- [ ] **Step 1: Déplacer**

```bash
mkdir -p core/typescript/src/extract
git mv api/src/services/text-extractor.ts core/typescript/src/extract/text.ts
```

- [ ] **Step 2: Réécrire les imports + le logger**

Dans `core/typescript/src/extract/text.ts` : remplacer `from '../config/logger.js'` par `from '../util/log.js'`. Remplacer `import { extractTextFromDocx } from './docx-reader.js'` par `from '../docx/reader.js'`.

- [ ] **Step 3: Re-export shim côté api/**

`api/src/services/text-extractor.ts` (nouveau) :
```ts
export * from '@cv-transpose/core';
```

Note : ne pas oublier de réexporter `extractText`, `extractTextFromBuffer` depuis `core/typescript/src/index.ts`.

- [ ] **Step 4: Typecheck + commit**

```bash
make typecheck-api
git add core/typescript/src/extract api/src/services/text-extractor.ts core/typescript/src/index.ts
git commit -m "refactor: move text extraction to @cv-transpose/core"
```

### Task 17 — Déplacer `template-contract.ts` dans core

**Files:**
- Move: `api/src/services/template-contract.ts` → `core/typescript/src/template/contract.ts`
- Move: `api/src/services/template-contract.test.ts` → `core/typescript/src/template/contract.test.ts`

- [ ] **Step 1: Déplacer + corriger imports**

```bash
git mv api/src/services/template-contract.ts core/typescript/src/template/contract.ts
git mv api/src/services/template-contract.test.ts core/typescript/src/template/contract.test.ts
```

Corriger les imports dans les fichiers déplacés (logger, types).

- [ ] **Step 2: Re-export shim**

`api/src/services/template-contract.ts` (nouveau) :
```ts
export * from '@cv-transpose/core';
```

Réexposer depuis `core/typescript/src/index.ts`.

- [ ] **Step 3: Typecheck + tests + commit**

```bash
make typecheck-api
docker compose run --rm api npx -w @cv-transpose/core vitest run contract
git add core/typescript/src/template api/src/services/template-contract.ts core/typescript/src/index.ts
git commit -m "refactor: move template contract to @cv-transpose/core"
```

### Task 18 — Simplifier `template-xml.ts` (un seul rendu, plus de variantes) et le déplacer dans core

**Files:**
- Source à simplifier puis déplacer : `api/src/services/template-xml.ts`
- Cible : `core/typescript/src/template/render.ts`

- [ ] **Step 1: Lister les variantes implémentées**

```bash
grep -E 'case .professional-compact|case .ats-core|case .executive-modern|case .keystone|case .solstice|case .celestial|case .aether|case .horizon' api/src/services/template-xml.ts | head
```

Identifier le **switch** des variantes qui produit des rendus différents.

- [ ] **Step 2: Retirer toutes les variantes sauf le rendu pilote (Celestial / template par défaut tenant)**

Modifier `api/src/services/template-xml.ts` (en place, avant déplacement) pour : retirer le switch sur la variante, garder une seule fonction `renderDocx(profile, manifest, baseDocx, brand)` qui consomme **uniquement le manifeste de template**. Plus de "if variant === 'celestial' then this else that".

Si Celestial était le pilote, conserver son code de rendu comme l'unique chemin. Tous les autres branchements supprimés.

- [ ] **Step 3: Déplacer dans core et corriger imports**

```bash
git mv api/src/services/template-xml.ts core/typescript/src/template/render.ts
```

Renommer la fonction publique en `renderDocx`. Réexporter depuis `core/typescript/src/index.ts`.

- [ ] **Step 4: Re-export shim**

`api/src/services/template-xml.ts` (nouveau) :
```ts
export * from '@cv-transpose/core';
```

- [ ] **Step 5: Tests existants doivent passer**

```bash
make typecheck-api
docker compose run --rm api npx -w @cv-transpose/core vitest run render contract
```

- [ ] **Step 6: Commit**

```bash
git add core/typescript/src/template/render.ts api/src/services/template-xml.ts core/typescript/src/index.ts
git commit -m "refactor: simplify template-xml to single tenant-template path and move to core/"
```

### Task 19 — Supprimer la customisation end-user

**Files:**
- Delete: `api/src/services/scalian-xml.ts`
- Delete: `api/src/services/template-variant-catalog.ts`
- Delete: `api/src/services/template-preview.ts`
- Delete: `api/src/services/docx-tooling.ts` (résidu preview/proof, après Task 15)
- Delete: `ui/static/template-previews/` (toute la galerie PNG)
- Modify: `ui/src/lib/pages/UploadPage.svelte` (retirer le sélecteur de template, chaque tenant a un seul template)

- [ ] **Step 1: Identifier les call-sites des fichiers à supprimer**

```bash
grep -rn 'scalian-xml\|template-variant-catalog\|template-preview\|docx-tooling' api/src/ ui/src/ --include='*.ts' --include='*.svelte' | head
```

Tous les imports trouvés vont être supprimés.

- [ ] **Step 2: Supprimer les fichiers `api/src/services/`**

```bash
git rm api/src/services/scalian-xml.ts \
       api/src/services/template-variant-catalog.ts \
       api/src/services/template-preview.ts \
       api/src/services/docx-tooling.ts
```

- [ ] **Step 3: Supprimer les previews UI**

```bash
git rm -r ui/static/template-previews/
```

- [ ] **Step 4: Modifier `UploadPage.svelte`**

Retirer dans le `<script>` toute logique de sélection de variante (`selectedVariant`, `availableVariants`, `templateGallery`). Le composant n'a plus qu'un seul template implicite (celui du tenant). Retirer le bloc HTML correspondant à la galerie.

- [ ] **Step 5: Mettre à jour les make targets s'il y en avait sur la galerie**

```bash
grep -E 'preview|gallery|variant' Makefile
```
Si des targets existent : les supprimer du `Makefile`.

- [ ] **Step 6: Typecheck UI + API**

```bash
make typecheck
```

- [ ] **Step 7: Commit**

```bash
git add -u
git commit -m "refactor: drop end-user template customization (gallery + variants), one template per tenant"
```

### Task 20 — Déplacer la validation page 1 dans core

**Files:**
- Extract: `api/src/services/orchestrator.ts::validatePage1WithPdf` → `core/typescript/src/validate/page1.ts`

- [ ] **Step 1: Test (sur un DOCX golden générique)**

`core/typescript/src/validate/page1.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { validatePage1 } from './page1.js';
import { readFileSync } from 'node:fs';

describe('validatePage1', () => {
  it('returns warnings array (may be empty) for a real DOCX', async () => {
    const docx = readFileSync(new URL('../../../../core/golden/cv-001-junior-pm.scalian.docx', import.meta.url));
    const r = await validatePage1(new Uint8Array(docx), {
      experienceSectionLabel: 'EXPERIENCE',
      sectorSectionLabel: 'COMPETENCES'
    });
    expect(Array.isArray(r.warnings)).toBe(true);
  });
});
```
(Le golden sera créé en Task 24. Pour l'instant marquer ce test `.skip` et l'activer en Task 24.)

- [ ] **Step 2: Implémenter**

`core/typescript/src/validate/page1.ts` :
```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

export interface ValidatePage1Options {
  experienceSectionLabel: string;
  sectorSectionLabel: string;
}

export interface Page1Validation {
  warnings: string[];
}

export async function validatePage1(
  docxBytes: Uint8Array,
  opts: ValidatePage1Options
): Promise<Page1Validation> {
  const warnings: string[] = [];
  const workDir = await mkdtemp(join(tmpdir(), 'page1-validate-'));
  const profileDir = join(workDir, 'profile');
  const docxPath = join(workDir, 'in.docx');

  try {
    await writeFile(docxPath, Buffer.from(docxBytes));
    await execFileAsync('libreoffice', [
      `-env:UserInstallation=file://${profileDir}`,
      '--headless', '--convert-to', 'pdf',
      '--outdir', workDir, docxPath
    ], { timeout: 30_000 });

    const pdfPath = join(workDir, 'in.pdf');
    const { stdout: page1 } = await execFileAsync('pdftotext',
      ['-f', '1', '-l', '1', pdfPath, '-'], { maxBuffer: 1024 * 1024 });

    if (page1.toUpperCase().includes(opts.experienceSectionLabel.toUpperCase())) {
      warnings.push(`Page 1 overflow: ${opts.experienceSectionLabel} found on page 1`);
    }
    if (!page1.toUpperCase().includes(opts.sectorSectionLabel.toUpperCase())) {
      warnings.push(`Page 1 underflow: ${opts.sectorSectionLabel} not found on page 1`);
    }
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }

  return { warnings };
}
```

(Reprend exactement le pattern saturation-safe : profil isolé, mkdtemp, finally rm.)

- [ ] **Step 3: Réexporter + supprimer la version dans api/**

Réexporter depuis `core/typescript/src/index.ts`. Dans `api/src/services/orchestrator.ts`, supprimer la fonction `validatePage1WithPdf` locale ; importer `validatePage1` depuis `@cv-transpose/core`.

- [ ] **Step 4: Typecheck + commit**

```bash
make typecheck-api
git add core/typescript/src/validate/page1.ts api/src/services/orchestrator.ts core/typescript/src/index.ts
git commit -m "refactor: move page1 validation to core (saturation-safe pattern preserved)"
```

### Task 21 — Implémenter `transpose()` publique

**Files:**
- Create: `core/typescript/src/transpose.ts`
- Test: `core/typescript/src/transpose.test.ts`

- [ ] **Step 1: Test avec mock LLM**

`core/typescript/src/transpose.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { transpose } from './transpose.js';
import { readFileSync } from 'node:fs';
import type { LlmProvider, TemplateAssets } from './index.js';

const fakeLlm: LlmProvider = {
  async complete() {
    return { text: JSON.stringify({
      name: 'Jane Doe',
      titleLine1: 'Product',
      titleLine2: 'Manager',
      experiences: [], education: [], skills: [], languages: [], certifications: []
    })};
  }
};

const baseDocx = readFileSync(new URL('../../../core/fixtures/templates-test/scalian/base.docx', import.meta.url));
const manifest = JSON.parse(
  readFileSync(new URL('../../../core/fixtures/templates-test/scalian/manifest.json', import.meta.url), 'utf8')
);

const assets: TemplateAssets = {
  manifest,
  baseDocx: new Uint8Array(baseDocx),
  brand: { primary: '#000', secondary: '#444', accent: '#888', fontFamily: 'Lato' }
};

describe('transpose', () => {
  it('returns a docx for a single CV input', async () => {
    const cv = readFileSync(new URL('../../../core/fixtures/cv-001-junior-pm.pdf', import.meta.url));
    const r = await transpose({
      files: [{ name: 'cv-001.pdf', bytes: new Uint8Array(cv), mime: 'application/pdf' }],
      template: assets,
      persistence: 'ephemeral',
      llm: fakeLlm
    });
    expect(r.results.length).toBe(1);
    expect(r.results[0].outputDocx.length).toBeGreaterThan(1000);
    expect(r.results[0].errors).toEqual([]);
  });
});
```

(Le fixture `cv-001-junior-pm.pdf` et `templates-test/scalian/*` sont créés en Task 22+.)

- [ ] **Step 2: Implémenter**

`core/typescript/src/transpose.ts` :
```ts
import type { TransposeInput, TransposeOutput, TransposedCv } from './types.js';
import { extractTextFromBuffer } from './extract/text.js';
import { renderDocx } from './template/render.js';
import { validatePage1 } from './validate/page1.js';
import { readFileSync } from 'node:fs';

const EXTRACT_PROMPT = readFileSync(
  new URL('../../../core/spec/prompts/extract-cv.md', import.meta.url),
  'utf8'
);

export async function transpose(input: TransposeInput): Promise<TransposeOutput> {
  const results: TransposedCv[] = [];
  for (const file of input.files) {
    const errors: string[] = [];
    let outputDocx = new Uint8Array();
    let detectedFields = { experienceCount: 0, educationCount: 0, skillBuckets: 0, languagesCount: 0 };
    let warnings: string[] = [];
    let page1Sections: string[] = [];

    try {
      const rawText = await extractTextFromBuffer(Buffer.from(file.bytes), file.name);
      const llmResp = await input.llm.complete({
        systemPrompt: EXTRACT_PROMPT,
        userPrompt: rawText,
        maxTokens: 8192,
        temperature: 0.1
      });
      const profile = JSON.parse(llmResp.text);
      detectedFields = {
        experienceCount: profile.experiences?.length ?? 0,
        educationCount: profile.education?.length ?? 0,
        skillBuckets: profile.skills?.length ?? 0,
        languagesCount: profile.languages?.length ?? 0
      };
      outputDocx = await renderDocx(profile, input.template.manifest,
                                    input.template.baseDocx, input.template.brand);
      const v = await validatePage1(outputDocx, {
        experienceSectionLabel: input.template.manifest.sections
          .find(s => s.kind === 'experiences')?.label ?? 'EXPERIENCE',
        sectorSectionLabel: input.template.manifest.sections
          .find(s => s.kind === 'skills')?.label ?? 'COMPETENCES'
      });
      warnings = v.warnings;
    } catch (e) {
      errors.push((e as Error).message);
    }

    results.push({
      sourceFileName: file.name,
      outputDocxName: file.name.replace(/\.[^.]+$/, '') + '.docx',
      outputDocx,
      alignmentReport: {
        validationPassed: errors.length === 0 && warnings.length === 0,
        warnings, detectedFields, page1SectionsFound: page1Sections
      },
      errors
    });
  }
  return { results };
}
```

- [ ] **Step 3: Réexporter et typecheck**

Ajouter `export * from './transpose.js'` dans `core/typescript/src/index.ts`. Lancer typecheck.

- [ ] **Step 4: Commit**

```bash
make typecheck-api
git add core/typescript/src/transpose.ts core/typescript/src/transpose.test.ts core/typescript/src/index.ts
git commit -m "feat(core): implement transpose() orchestrator over the 5-step pipeline"
```

### Task 22 — Templates de test (deux variantes minimales)

**Files:**
- Create: `core/fixtures/templates-test/scalian/manifest.json`
- Create: `core/fixtures/templates-test/scalian/base.docx` (copie sanitisée du Scalian d'exemple)

- [ ] **Step 1: Copier le `base.docx` Scalian existant**

```bash
mkdir -p core/fixtures/templates-test/scalian
cp api/templates/scalian/base.docx core/fixtures/templates-test/scalian/base.docx 2>/dev/null \
  || echo "Ajuster le chemin source"
```
Vérifier qu'aucune PII réelle n'y est. Si nécessaire, ouvrir et neutraliser. Dans le doute : abandonner et arbitrer avec utilisateur.

- [ ] **Step 2: Écrire un manifest minimal**

`core/fixtures/templates-test/scalian/manifest.json` :
```json
{
  "version": "1.0",
  "tenantKey": "direct:scalian-test",
  "naming": "{name}_CV.docx",
  "header": {
    "nameSlot": { "paragraphIndex": 0, "runIndex": 0, "maxChars": 80 },
    "titleLine1Slot": { "paragraphIndex": 1, "runIndex": 0, "maxChars": 25 },
    "titleLine2Slot": { "paragraphIndex": 1, "runIndex": 1, "maxChars": 25 }
  },
  "sections": [
    { "id": "experience", "kind": "experiences", "label": "EXPERIENCE PROFESSIONNELLE", "maxItems": 8 },
    { "id": "skills", "kind": "skills", "label": "COMPETENCES", "maxItems": 6 },
    { "id": "education", "kind": "education", "label": "FORMATION", "maxItems": 4 },
    { "id": "languages", "kind": "languages", "label": "LANGUES", "maxItems": 6 }
  ],
  "validationRulesRef": "default"
}
```

- [ ] **Step 3: Validation contre le schéma**

```bash
docker compose run --rm api npx -w @cv-transpose/core vitest run manifest
```
Ajouter un test qui charge ce fichier et vérifie qu'il valide.

- [ ] **Step 4: Commit**

```bash
git add core/fixtures/templates-test/
git commit -m "test(core): add scalian test template (manifest + base.docx) for fixtures"
```

### Task 23 — Trois fixtures CVs anonymes

**Files:**
- Create: `core/fixtures/cv-001-junior-pm.pdf`
- Create: `core/fixtures/cv-001-junior-pm.expected-extraction.json`
- Create: `core/fixtures/cv-002-senior-archi.docx`
- Create: `core/fixtures/cv-002-senior-archi.expected-extraction.json`
- Create: `core/fixtures/cv-003-multi-langue.pdf`
- Create: `core/fixtures/cv-003-multi-langue.expected-extraction.json`

- [ ] **Step 1: Générer 3 CVs fictifs**

Utiliser un script `core/fixtures/generate.ts` (à écrire) qui génère 3 CVs en PDF/DOCX à partir de profils JSON anonymes. Profils :
- 001 : Jane Smith, junior PM (3 ans), 1 expérience, 1 formation, 4 skills, 2 langues
- 002 : Marc Durand, senior architecte (15 ans), 4 expériences, 2 formations, 6 skill buckets, 3 langues, 2 certifications
- 003 : Lucia Rossi, intermédiaire devops (7 ans), 3 expériences, 1 formation, 5 skills, 4 langues (FR/EN/IT/ES)

Strict : aucun nom, email, téléphone réel. Vérifier `grep -E '@(gmail|yahoo|outlook)\.com\|\b06\.\b' core/fixtures/` ne renvoie rien.

- [ ] **Step 2: Écrire les `*.expected-extraction.json`**

Pour chaque fixture, le JSON attendu en sortie de l'étape extract (référence pour evals LLM, pas pour égalité stricte).

- [ ] **Step 3: Commit**

```bash
git add core/fixtures/
git commit -m "test(core): add 3 anonymous fixture CVs (junior, senior, multi-langue)"
```

### Task 24 — Goldens DOCX pour les fixtures

**Files:**
- Create: `core/golden/cv-001-junior-pm.scalian.docx`
- Create: `core/golden/cv-002-senior-archi.scalian.docx`
- Create: `core/golden/cv-003-multi-langue.scalian.docx`

- [ ] **Step 1: Script de génération**

`core/typescript/scripts/regen-goldens.ts` :
```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { transpose } from '../src/transpose.js';
import type { LlmProvider, TemplateAssets } from '../src/index.js';

const FIXTURES = ['cv-001-junior-pm', 'cv-002-senior-archi', 'cv-003-multi-langue'] as const;
const TEMPLATE_KEY = 'scalian';

const baseDocx = readFileSync(new URL(`../../fixtures/templates-test/${TEMPLATE_KEY}/base.docx`, import.meta.url));
const manifest = JSON.parse(
  readFileSync(new URL(`../../fixtures/templates-test/${TEMPLATE_KEY}/manifest.json`, import.meta.url), 'utf8')
);
const assets: TemplateAssets = {
  manifest,
  baseDocx: new Uint8Array(baseDocx),
  brand: { primary: '#4B4E55', secondary: '#6F6B74', accent: '#F2F2F2', fontFamily: 'Lato' }
};

for (const fxId of FIXTURES) {
  const expected = JSON.parse(
    readFileSync(new URL(`../../fixtures/${fxId}.expected-extraction.json`, import.meta.url), 'utf8')
  );
  const stubLlm: LlmProvider = {
    async complete() { return { text: JSON.stringify(expected) }; }
  };
  const inputBytes = readFileSync(new URL(`../../fixtures/${fxId}.${fxId.endsWith('archi') ? 'docx' : 'pdf'}`, import.meta.url));
  const mime = fxId.endsWith('archi')
    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : 'application/pdf';
  const r = await transpose({
    files: [{ name: `${fxId}.${mime.includes('pdf') ? 'pdf' : 'docx'}`, bytes: new Uint8Array(inputBytes), mime: mime as any }],
    template: assets,
    persistence: 'ephemeral',
    llm: stubLlm
  });
  if (r.results[0].errors.length) throw new Error(`fixture ${fxId} failed: ${r.results[0].errors.join('; ')}`);
  writeFileSync(
    new URL(`../../golden/${fxId}.${TEMPLATE_KEY}.docx`, import.meta.url),
    r.results[0].outputDocx
  );
  console.log(`golden written: ${fxId}.${TEMPLATE_KEY}.docx (${r.results[0].outputDocx.length} bytes)`);
}
```

(Utilise un LLM stub pour rendre le golden déterministe — pas d'appel LLM réel ici.)

- [ ] **Step 2: Lancer le script (dans Docker)**

```bash
docker compose run --rm api npx -w @cv-transpose/core tsx scripts/regen-goldens.ts
```
Expected: 3 fichiers créés dans `core/golden/`.

- [ ] **Step 3: Activer le test `.skip` du Task 20**

Retirer le `.skip` sur `validate/page1.test.ts`, vérifier qu'il passe.

- [ ] **Step 4: Activer les tests `transpose.test.ts`**

Vérifier que le test transpose passe avec ces fixtures et goldens.

- [ ] **Step 5: Commit**

```bash
git add core/golden/ core/typescript/scripts/regen-goldens.ts core/typescript/src/validate/page1.test.ts
git commit -m "test(core): add goldens for the 3 fixtures + activate page1 + transpose tests"
```

### Task 25 — Migrer `orchestrator.ts` pour utiliser `transpose()`

**Files:**
- Modify: `api/src/services/orchestrator.ts`

- [ ] **Step 1: Lire l'orchestrator existant**

Identifier la fonction principale (`processBatch`, `transposeOne`, etc.) et l'appel multi-étapes interne (extract → cv-agent → render → validate).

- [ ] **Step 2: Remplacer le pipeline interne par `transpose()`**

Au lieu d'appeler une à une les fonctions extract/render/validate, appeler `transpose()` du core avec :
- `files` : les CVs uploadés en buffer
- `template` : chargé depuis `tenant-config` (pour l'instant lecture S3, demain backoffice)
- `persistence: 'session'`
- `llm` : `adaptRegistryToCoreProvider({ provider: env.LLM_PROVIDER })`

L'orchestrator garde la responsabilité de : lecture session, écriture chiffrée du DOCX 48h, SSE progress events, batch summary. Le pipeline métier devient un appel.

- [ ] **Step 3: Typecheck + tests existants**

```bash
make typecheck-api
docker compose run --rm api npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add api/src/services/orchestrator.ts
git commit -m "refactor(api): orchestrator now delegates to core.transpose()"
```

### Task 26 — Supprimer les shims `api/src/services/*.ts`

**Files:**
- Delete: `api/src/services/docx-tools.ts` (shim)
- Delete: `api/src/services/docx-reader.ts` (shim)
- Delete: `api/src/services/font-embedding.ts` (shim)
- Delete: `api/src/services/text-extractor.ts` (shim)
- Delete: `api/src/services/template-contract.ts` (shim)
- Delete: `api/src/services/template-xml.ts` (shim)
- Modify: tout call-site api/ pour importer directement depuis `@cv-transpose/core`

- [ ] **Step 1: Trouver les imports**

```bash
grep -rn "from '\\./docx-tools\\|from '\\./docx-reader\\|from '\\./font-embedding\\|from '\\./text-extractor\\|from '\\./template-contract\\|from '\\./template-xml\\|from '\\./services/docx-tools\\|from '\\./services/docx-reader\\|from '\\./services/font-embedding\\|from '\\./services/text-extractor\\|from '\\./services/template-contract\\|from '\\./services/template-xml" api/src/
```

- [ ] **Step 2: Remplacer par `from '@cv-transpose/core'`**

Pour chaque ligne trouvée, mettre à jour vers l'import depuis le package.

- [ ] **Step 3: Supprimer les shims**

```bash
git rm api/src/services/docx-tools.ts api/src/services/docx-reader.ts \
       api/src/services/font-embedding.ts api/src/services/text-extractor.ts \
       api/src/services/template-contract.ts api/src/services/template-xml.ts
```

- [ ] **Step 4: Typecheck**

```bash
make typecheck
```

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "chore(api): remove core shims, import directly from @cv-transpose/core"
```

### Task 27 — Mettre à jour `api/Dockerfile`

**Files:**
- Modify: `api/Dockerfile`

- [ ] **Step 1: Lire le Dockerfile existant**

Le build context est `api/`. Le shell web va dépendre de `core/typescript/` via npm workspace. Il faut donc soit (a) déplacer le build context à la racine, soit (b) copier `core/` dans le contexte api/ au build.

Reco : (a). Le build context devient la racine du monorepo. Plus propre, plus aligné avec le pattern workspace.

- [ ] **Step 2: Modifier `docker-compose.yml`**

```yaml
api:
  build:
    context: .                # racine du monorepo
    dockerfile: api/Dockerfile
```

(La racine devient le build context ; `api/` reste le path du Dockerfile.)

- [ ] **Step 3: Adapter `api/Dockerfile`**

Remplacer les `COPY package*.json ./` et `COPY . .` par :
```dockerfile
WORKDIR /app
COPY package.json package-lock.json* ./
COPY core/typescript/package.json core/typescript/
COPY api/package.json api/
COPY ui/package.json ui/
RUN npm ci
COPY core/ core/
COPY api/ api/
WORKDIR /app/api
```

(npm ci au niveau workspace résout `@cv-transpose/core` localement.)

- [ ] **Step 4: Build prod local**

```bash
TARGET=production docker compose build --no-cache api
```
Expected: build OK, image construite.

- [ ] **Step 5: Smoke run**

```bash
make up
sleep 5
curl -fsS http://localhost:8686/api/health && echo OK
make down
```
Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git add api/Dockerfile docker-compose.yml
git commit -m "chore(docker): build api/ from monorepo root context to include core/"
```

### Task 28 — UAT manuelle bout-en-bout

**Files:**
- Modify: `PLAN.md` (mise à jour de la Phase 1 P1.1 avec section dédiée)

- [ ] **Step 1: Lancer la stack en local**

```bash
make up
```

- [ ] **Step 2: Charger un tenant test (Scalian) + uploader un CV fixture**

Vérifier dans l'UI que le DOCX rendu est conforme à ce qu'on avait avant la refonte (visuellement ou en diff OOXML normalisé).

- [ ] **Step 3: Vérifier que la galerie de templates n'apparaît plus**

Le sélecteur de variante doit être absent. Le tenant `_default` rend avec le template par défaut, le tenant `scalian` rend avec son template Scalian.

- [ ] **Step 4: Vérifier la persistance et le DL**

Session 48h : URL partageable accessible avec mot de passe, DL DOCX, ZIP batch.

- [ ] **Step 5: Mettre à jour `PLAN.md`** dans la section Phase 1 marketplace

Cocher les items de P1.1 réalisés dans la PLAN.md du wip/saturation-and-celestial (à faire au moment de l'intégration finale).

- [ ] **Step 6: Commit**

```bash
git add PLAN.md
git commit -m "doc: mark P1.1 core extraction items done"
```

### Task 29 — Tagger `core-v0.1.0`

**Files:**
- Tag : `core-v0.1.0` annoté

- [ ] **Step 1: Mettre à jour la version dans `core/typescript/package.json`**

```json
{
  "name": "@cv-transpose/core",
  "version": "0.1.0",
  ...
}
```

- [ ] **Step 2: Commit**

```bash
git add core/typescript/package.json
git commit -m "chore(core): release 0.1.0"
```

- [ ] **Step 3: Tag**

```bash
git tag -a core-v0.1.0 -m "Core v0.1.0 — extracted TS port, single-template-per-tenant, shared spec assets"
git push origin wip/p1.1-core-extraction
git push origin core-v0.1.0
```

### Task 30 — Pousser et ouvrir une PR draft

**Files:**
- PR draft sur GitHub (`wip/p1.1-core-extraction` → `wip/saturation-and-celestial`)

- [ ] **Step 1: Pousser et créer la PR draft**

```bash
gh pr create --draft \
  --base wip/saturation-and-celestial \
  --head wip/p1.1-core-extraction \
  --title "P1.1 — Core extraction (TS port + shared spec)" \
  --body "Voir spec/SPEC_EVOL_MULTI_MARKETPLACE.md §4.5 et plans/PLAN_P1.1_CORE_EXTRACTION.md."
```

(Si la base partage l'historique avec la branche d'exécution — ce qui est le cas puisqu'on a forké depuis elle — la PR doit s'ouvrir sans le problème "no common ancestor".)

- [ ] **Step 2: Vérifier que la CI passe**

Si une CI (GitHub Actions) existe, valider que typecheck + tests passent.

---

## Self-review

À effectuer après écriture du plan. **Sortie de la self-review** :

- Pas de placeholders : OK (toutes les valeurs concrètes, pas de TBD).
- Cohérence types : `LlmProvider`, `TransposeInput`, `TemplateAssets` utilisés tels que définis en Task 11 et Task 12 — alignés avec le Contract 1.
- Cohérence chemins : tous les fichiers utilisent `core/typescript/src/...` (pas de `cv-transpose-core` résiduel) — vérifié.
- Couverture spec : §3 architecture (Tasks 2-4), §4.5 cœur (Tasks 11-26), §6.1 fixtures et goldens (Tasks 22-24), §9 fail-loud (préservé Tasks 14-20), §10 décisions (one-template-per-tenant en Tasks 18-19), §13 dépendances (manifeste de template = pré-requis P1.1, créé Tasks 5-6) — couverts.
- Périmètre cohérent : pas d'extension hors P1.1 (Python = P1.2, backoffice = P1.3, agents = P1.4-5).

---

## Execution Handoff

**Plan complet et sauvé dans `plans/PLAN_P1.1_CORE_EXTRACTION.md`.**

Deux options d'exécution :

1. **Subagent-Driven (recommandée)** — un subagent dispatché par tâche, review entre chaque tâche, itération rapide.
2. **Inline Execution** — exécution dans la session courante via `superpowers:executing-plans`, batch avec checkpoints.

À choisir au moment du démarrage effectif (qui n'est **pas** maintenant, le plan reste un document de référence sur `wip/multi-marketplace-design`).
