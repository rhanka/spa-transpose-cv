# SPEC_EVOL_MULTI_MARKETPLACE_INTERFACES

> Contrats d'interface partagés entre les 5 sous-systèmes de la Phase 1
> de `SPEC_EVOL_MULTI_MARKETPLACE.md`. À figer avant d'écrire les plans
> P1.1 → P1.5, sinon contradictions garanties.

Date : 2026-04-25
Statut : interfaces à valider avant écriture des plans détaillés
Parent : `spec/SPEC_EVOL_MULTI_MARKETPLACE.md`

## Carte des dépendances

```
                ┌─────────────────────────────┐
                │ Contrat 1 — Cœur (API)      │
                │ TS + Python, signatures     │
                │ identiques à la casse près  │
                └──────┬──────────────────────┘
                       │ consommé par
        ┌──────────────┼──────────────────┐
        │              │                  │
┌───────┴──────┐ ┌─────┴────────┐ ┌───────┴────────┐
│ P1.1 web TS  │ │ P1.4 agent MS│ │ P1.5 agent GW  │
│ + P1.2 port  │ │ Python sbx   │ │ Python sbx     │
│ Python       │ └──────────────┘ └────────────────┘
└──────────────┘

                ┌─────────────────────────────┐
                │ Contrat 2 — Manifeste       │
                │ template (JSON Schema v1)   │
                └──────┬──────────────────────┘
                       │ produit par P1.3, consommé par P1.1/P1.2/P1.4/P1.5
                       │
                ┌──────┴──────────────────────┐
                │ Contrat 3 — API assets      │
                │ backoffice (HTTP + JWT)     │
                └──────┬──────────────────────┘
                       │ exposé par P1.3, consommé par P1.4 + P1.5
                       │ (P1.1 web peut court-circuiter en lecture
                       │  directe S3 si même process)
                       │
                ┌──────┴──────────────────────┐
                │ Contrat 4 — Fixtures        │
                │ d'équivalence               │
                └─────────────────────────────┘
                       │ posé par P1.1, consommé par P1.2 (CI éq.)
```

## Contrat 1 — Cœur (API exécutable, parité TS / Python)

### 1.1 Signature de la fonction publique

**TypeScript** (`core/typescript/src/index.ts`, package npm
`@cv-transpose/core` consommé via npm workspace local) :

```ts
export interface InputFile {
  name: string;
  bytes: Uint8Array;
  mime: 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' | 'application/msword';
}

export interface BrandTokens {
  primary: string;       // hex
  secondary: string;     // hex
  accent: string;        // hex
  fontFamily: string;    // fallback list
}

export type Persistence = 'session' | 'ephemeral';

export interface LlmProvider {
  complete(args: {
    systemPrompt: string;
    userPrompt: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<{ text: string; usage?: { inputTokens: number; outputTokens: number } }>;
}

export interface TemplateAssets {
  manifest: TemplateManifest;     // voir Contrat 2
  baseDocx: Uint8Array;
  brand: BrandTokens;
}

export interface TransposeInput {
  files: InputFile[];
  template: TemplateAssets;
  persistence: Persistence;
  llm: LlmProvider;
}

export interface DetectedFields {
  name?: string;
  titleLine1?: string;
  titleLine2?: string;
  yearsOfExperience?: number;
  experienceCount: number;
  educationCount: number;
  skillBuckets: number;
  languagesCount: number;
}

export interface AlignmentReport {
  validationPassed: boolean;
  warnings: string[];
  detectedFields: DetectedFields;
  page1SectionsFound: string[];
}

export interface TransposedCv {
  sourceFileName: string;
  outputDocxName: string;        // calculé via template.manifest.naming
  outputDocx: Uint8Array;
  alignmentReport: AlignmentReport;
  errors: string[];              // vide si OK ; rempli si fail-loud
}

export interface TransposeOutput {
  results: TransposedCv[];
}

export async function transpose(input: TransposeInput): Promise<TransposeOutput>;
```

**Python** (`core/python/cv_transpose_core/__init__.py`) — mêmes
champs en `snake_case`, mêmes invariants, mêmes erreurs :

```python
from dataclasses import dataclass
from typing import Literal, Protocol

@dataclass(frozen=True)
class InputFile:
    name: str
    bytes_: bytes
    mime: Literal['application/pdf',
                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                  'application/msword']

@dataclass(frozen=True)
class BrandTokens:
    primary: str
    secondary: str
    accent: str
    font_family: str

Persistence = Literal['session', 'ephemeral']

class LlmProvider(Protocol):
    async def complete(self, *, system_prompt: str, user_prompt: str,
                       max_tokens: int | None = None,
                       temperature: float | None = None) -> dict: ...

@dataclass(frozen=True)
class TemplateAssets:
    manifest: dict      # validated against template-manifest-v1.json
    base_docx: bytes
    brand: BrandTokens

@dataclass(frozen=True)
class TransposeInput:
    files: list[InputFile]
    template: TemplateAssets
    persistence: Persistence
    llm: LlmProvider

# DetectedFields, AlignmentReport, TransposedCv, TransposeOutput : idem,
# noms de champs en snake_case.

async def transpose(input_: TransposeInput) -> TransposeOutput: ...
```

### 1.2 Invariants de la fonction `transpose`

- **Pure dans son comportement métier** : pour un même `(files, template,
  prompts version)`, la sortie OOXML est strictement identique entre les
  deux ports (test d'équivalence Contrat 4).
- **Effets de bord autorisés** : aucun en mode `ephemeral` (zéro write
  disque, buffers zéroïsés à la sortie). En mode `session`, écriture sur
  volume chiffré uniquement (réservé au shell web).
- **Erreurs** : jamais de swallow. Toute erreur native (LLM, parse OOXML,
  fonte manquante) remonte dans `TransposedCv.errors` ou est levée si
  fatale (template manifeste invalide, base.docx illisible).
- **Pas d'I/O réseau** sauf l'appel `LlmProvider.complete` injecté.
  Aucun fetch direct de template ou de fonts : tout vient de `TemplateAssets`.

### 1.3 Versioning

- Le cœur vit dans `core/` du monorepo `spa-transpose-cv`. Versioning via
  tags Git annotés `core-vX.Y.Z` (semver strict sur les contrats publics
  ci-dessus).
- Les ports TS et Python avancent en parallèle, mêmes numéros de version
  (le tag couvre les deux).
- Bump majeur dès qu'une signature publique change.

## Contrat 2 — Manifeste de template (JSON Schema v1)

### 2.1 Schéma

Stocké à `core/schemas/template-manifest-v1.json`.

Structure minimale (extraits, schéma complet versionné) :

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://cv-transpose.com/schemas/template-manifest-v1.json",
  "type": "object",
  "required": ["version", "tenantKey", "naming", "sections", "header"],
  "properties": {
    "version": { "const": "1.0" },
    "tenantKey": {
      "type": "string",
      "pattern": "^(direct|ms|gws):[A-Za-z0-9._-]+$"
    },
    "naming": {
      "type": "string",
      "description": "Template de nommage du DOCX sortant. Variables : {name} {lang} {ts}"
    },
    "header": {
      "type": "object",
      "required": ["nameSlot", "titleLine1Slot", "titleLine2Slot"],
      "properties": {
        "nameSlot":      { "$ref": "#/definitions/slot" },
        "titleLine1Slot":{ "$ref": "#/definitions/slot" },
        "titleLine2Slot":{ "$ref": "#/definitions/slot" }
      }
    },
    "sections": {
      "type": "array",
      "items": { "$ref": "#/definitions/section" }
    },
    "validationRulesRef": {
      "type": "string",
      "description": "Identifiant d'un ruleset dans validation-rules.json"
    }
  },
  "definitions": {
    "slot": {
      "type": "object",
      "required": ["paragraphIndex", "runIndex"],
      "properties": {
        "paragraphIndex": { "type": "integer", "minimum": 0 },
        "runIndex":       { "type": "integer", "minimum": 0 },
        "maxChars":       { "type": "integer", "minimum": 1 }
      }
    },
    "section": {
      "type": "object",
      "required": ["id", "kind", "label"],
      "properties": {
        "id":   { "type": "string" },
        "kind": { "enum": ["experiences", "education", "skills", "languages", "certifications", "narrative"] },
        "label":{ "type": "string", "maxLength": 80 },
        "anchorParagraphIndex": { "type": "integer", "minimum": 0 },
        "maxItems":             { "type": "integer", "minimum": 1 },
        "itemTemplateRef":      { "type": "string" }
      }
    }
  }
}
```

### 2.2 Règles de migration

- Toute rupture du schéma → bump du numéro de version (`v1.json` →
  `v2.json`). Le cœur supporte au moins N et N-1.
- Les manifestes des tenants stockés dans le backoffice incluent
  `"version": "1.0"`. La validation est faite au chargement par chaque
  port (TS via `ajv`, Python via `jsonschema`).
- Le manifeste référence `validationRulesRef` dans
  `core/validation-rules.json` (catalogue de rulesets nommés,
  versionné en parallèle).

## Contrat 3 — API assets backoffice (HTTP + JWT)

### 3.1 Endpoints (read-only)

```
GET /api/v1/tenants/{tenantKey}/manifest
   → 200 application/json  (manifeste validé contre v1)
   → 401 si JWT invalide
   → 404 si tenant inconnu

GET /api/v1/tenants/{tenantKey}/base.docx
   → 200 application/vnd.openxmlformats-officedocument.wordprocessingml.document
   → 401 / 404 idem

GET /api/v1/tenants/{tenantKey}/brand
   → 200 application/json (BrandTokens)
   → 401 / 404 idem
```

`tenantKey` est URL-encoded. Cache HTTP : `Cache-Control: private,
max-age=300` (5 min).

### 3.2 JWT

- **Algorithme** : `RS256`, JWKS publié par chaque runtime adapter (web,
  MS Copilot, Gemini ADK).
- **Issuers attendus** (claim `iss`) :
  - `web-direct.cv-transpose.com`
  - `ms-copilot.cv-transpose.com`
  - `gemini-ent.cv-transpose.com`
- **Claims requis** :
  - `iss` : un des trois ci-dessus
  - `sub` : identifiant utilisateur final (UPN MS / email Workspace / session-id web)
  - `tk`  : tenant key complète (ex. `ms:abc-def-uuid`)
  - `iat` : émission
  - `exp` : `iat + 300` (5 min max)
- **Header HTTP** : `Authorization: Bearer <jwt>`.
- **Erreur** : `401` avec corps `{"error": "invalid_jwt", "reason": "<sig|exp|iss|tk_mismatch>"}`.
  Pas de body sur `404`.

### 3.3 Bootstrap des JWKS

- Chaque runtime adapter publie son JWKS sur une URL bien connue
  (`/.well-known/jwks.json` côté adapter).
- Le backoffice fetch et cache 24 h, refresh sur kid inconnu.
- Rotation des clés : chaque adapter peut tourner ses clés sans
  coordination, le backoffice s'aligne.

### 3.4 Hors scope phase 1

- `POST` / `PUT` / `DELETE` sur les ressources tenant : géré uniquement
  via le portail admin (UI Svelte), pas exposé en API publique.
- Listing tenants (`GET /api/v1/tenants`) : interdit publiquement.

## Contrat 4 — Fixtures d'équivalence

### 4.1 Layout

```
core/
├── fixtures/
│   ├── cv-001-junior-pm.pdf
│   ├── cv-001-junior-pm.expected-extraction.json   # JSON attendu après LLM
│   ├── cv-002-senior-archi.docx
│   ├── cv-002-senior-archi.expected-extraction.json
│   └── ... (≥ 30 fixtures couvrant junior, senior, multi-langues, edge cases)
├── golden/
│   ├── cv-001-junior-pm.celestial.docx
│   ├── cv-001-junior-pm.celestial.png      # rendu LibreOffice page 1
│   ├── cv-001-junior-pm.scalian.docx
│   ├── cv-001-junior-pm.scalian.png
│   └── ...                                  # un golden par (cv, template-key)
└── templates-test/
    ├── celestial/manifest.json
    ├── celestial/base.docx
    ├── scalian/manifest.json
    └── scalian/base.docx
```

### 4.2 Format des fichiers

- `*.expected-extraction.json` : JSON conforme au schéma de sortie de
  l'étape extract du workflow (pas du DOCX final). Ce fichier sert
  uniquement aux evals LLM avec recall calculé sur les champs critiques.
- `*.{template-key}.docx` : sortie OOXML attendue, normalisée (timestamps
  zéroïsés, IDs déterministes).
- `*.{template-key}.png` : rendu page 1 via LibreOffice, 286×470, base
  pour la mesure RMSE.

### 4.3 Règles de comparaison

| Comparaison | Tolérance | Outil |
|---|---|---|
| Structure OOXML (XPath, attributs, ordre) | **0** (égalité stricte après normalisation) | helper `normalize_docx(bytes) -> tree` implémenté dans chaque port (`core/typescript/src/test/normalize.ts`, `core/python/cv_transpose_core/test/normalize.py`), spécifié par le même pseudocode dans `core/spec/normalize-docx.md` (zéroïsation timestamps, tri attributs, suppression IDs aléatoires) |
| Rendu PNG page 1 | RMSE < **0.15** sur 286×470 | `convert -metric RMSE` (LibreOffice côté CI uniquement) |
| Extraction JSON (LLM-judge) | recall ≥ **0.95** sur (`name`, `experiences[].title`, `experiences[].dates`, `languages[].name`) | LLM externe en test (Claude ou Gemini) |

### 4.4 Politique d'ajout

- Une nouvelle fixture exige son golden pour **chaque** template-test
  versionné dans `templates-test/`.
- Si une régression légitime change l'OOXML : on régénère les goldens
  dans le même PR, on documente la raison, on bump la version mineure.
- Aucune fixture n'inclut de PII réelle. Les CVs sont fictifs et anonymes
  (cf. `feedback_resource_budget` et la consigne historique du repo).

## Validation des contrats

Avant que les plans P1.1 → P1.5 ne soient écrits, les 4 contrats
ci-dessus doivent être :

- relus et amendés par l'utilisateur,
- committés sur la branche `wip/multi-marketplace-design`.

Toute évolution ultérieure d'un contrat suit la règle :
- changement non rétro-compatible → bump majeur du contrat → coordination
  explicite entre les 5 sous-plans concernés ;
- changement rétro-compatible → bump mineur, pas de coordination
  nécessaire, les sous-plans rattrapent à leur rythme.
