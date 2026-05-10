# SPEC_EVOL_TRANSPOSE_EXTENSIONS

> Extensions de l'API publique `transpose()` de `@cv-transpose/core` pour
> couvrir les concerns du shell web actuel (streaming, retries,
> instrumentation) et des futurs agents marketplace. Successeur direct de
> la Task 25 de P1.1, différée volontairement.

Date : 2026-05-10
Statut : à valider, prérequis pour migrer le shell web ET pour les agents marketplace
Parents :
- `spec/SPEC_EVOL_MULTI_MARKETPLACE.md`
- `spec/SPEC_EVOL_MULTI_MARKETPLACE_INTERFACES.md` (Contract 1)
- `plans/PLAN_P1.1_CORE_EXTRACTION.md` (Task 25 différée)

## 1. Pourquoi

P1.1 a livré `transpose()` v0.1.0 (`core-v0.1.0`) avec un pipeline minimal
(extract → LLM → render → validatePage1). En tentant de migrer l'orchestrator
api/ pour qu'il délègue à `transpose()`, neuf gaps de comportement ont été
identifiés. Les fermer côté `transpose()` est ce qui débloque :

- la migration finale de `api/src/services/orchestrator.ts` (suppression
  de la duplication de pipeline entre core et api),
- les agents marketplace (P1.4 MS Copilot, P1.5 Gemini Enterprise) qui
  consomment `transpose()` directement et veulent aussi du streaming, du
  retry, et de l'instrumentation.

Sans cette extension, ces deux chantiers re-importent en doublon de la
logique qui devrait vivre dans le cœur.

## 2. Gaps à fermer

Identifiés lors de la tentative de Task 25, depuis le diff entre
`api/src/services/orchestrator.ts::processOneCV` et `core.transpose()` :

| # | Gap | Conséquence si non fermé |
|---|---|---|
| 1 | **Per-CV user prompt** : l'orchestrator construit un `userPrompt` à partir de `meta.prompt` + `targetCompany` (et, lors des retries, du feedback de validation). `transpose()` envoie uniquement `rawText` à `LlmProvider.complete`. | Perte du tailoring target-company ; perte du feedback de retry. |
| 2 | **Streaming SSE** : `extractCvDataWithRetry` consomme `provider.generateStream` et émet `thinking_delta`, `content_delta`, `parsed_keys`. `LlmProvider.complete` est non-streaming. | UI streaming web cassée si on délègue. Les marketplaces (Copilot, Gemini) bénéficient aussi du streaming. |
| 3 | **Token usage** : `transpose()` reçoit `usage` du provider et le jette. L'orchestrator l'utilise pour la ligne FinOps (`costUsd`, `co2Grams`, `ledMinutes`). | Perte de la ligne cost/CO2 SSE et dans le batch summary. |
| 4 | **`CvData` parsée** : `TransposedCv` n'expose pas le profil. L'orchestrator lit `cvData.attention_cv` pour SSE `done` event et batch summary. | Perte des warnings de fidélité côté UI. |
| 5 | **`sourceText`** : le conducteur QA (`conductorValidate`) compare texte source vs DOCX rendu. `transpose()` jette le texte extrait. | Conductor pass impossible. |
| 6 | **Validation structurelle DOCX** : l'orchestrator appelle `validateDocxBuffer(output, requiredSectionLabels)`. `transpose()` ne fait que `validatePage1`. | Sections obligatoires manquantes non détectées. |
| 7 | **Retry sur feedback de validation** : si erreurs de header/structural/page1, l'orchestrator re-extrait avec prompt amendé ("shorten skill descriptions, reduce sectors to 4"). | Perte de la boucle de correction automatique. |
| 8 | **`sourceFileName` injecté dans le user prompt** : la prompt template demande `Candidate XXXXX` extraction. | Naming du DOCX généré perd la ref candidate. |
| 9 | **Reasoning budget** : `cv-agent.ts` passe `enableReasoning: true, reasoningBudget: 4096`. Ni `LlmCompleteArgs` ni l'adapter ne les portent. | Perte de qualité d'extraction sur les modèles avec thinking (Claude 4.7, GPT-5, Gemini 3.1). |

## 3. Extensions proposées de Contract 1

### 3.1 `InputFile` enrichi

```ts
export interface InputFile {
  name: string;
  bytes: Uint8Array;
  mime: CvMime;

  /** Optionnel : prompt utilisateur par CV (tailoring target-company, etc.).
   *  Inséré dans le user prompt template à la place de `{userPrompt}`. */
  userPromptOverride?: string;
}
```

### 3.2 `TransposeInput` enrichi

```ts
export interface TransposeInput {
  files: InputFile[];
  template: TemplateAssets;
  persistence: Persistence;
  llm: LlmProvider;

  /** Options globales d'extraction LLM. */
  extraction?: {
    /** Token budget thinking (Claude / GPT-5 / Gemini Pro). */
    reasoningBudget?: number;
    /** `true` (défaut) : activer extended thinking si le provider le supporte. */
    enableReasoning?: boolean;
    /** Max retries sur feedback de validation. 0 = no retry. Défaut : 1. */
    maxValidationRetries?: number;
  };

  /** Streaming callbacks. Si omis, transpose() reste non-streaming. */
  streamCallbacks?: {
    onPhaseChange?: (file: string, phase: TransposePhase) => void;
    onThinkingDelta?: (file: string, delta: string) => void;
    onContentDelta?: (file: string, delta: string) => void;
    onParsedKeys?: (file: string, keys: string[]) => void;
  };
}

export type TransposePhase =
  | 'extract-text'
  | 'extract-cv-llm'
  | 'render-docx'
  | 'validate-page1'
  | 'validate-structural'
  | 'retry'
  | 'done';
```

### 3.3 `TransposedCv` enrichi

```ts
export interface TransposedCv {
  sourceFileName: string;
  outputDocxName: string;
  outputDocx: Uint8Array;

  /** Profil structuré extrait — utile pour batch summary, SSE done event,
   *  conductor pass et debugging. */
  profile: CvData;

  /** Texte brut extrait du CV source. Utile au conductor QA pass. */
  sourceText: string;

  /** Token usage du provider, agrégé sur les retries éventuels. */
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };

  /** Combinaison de validatePage1 + validateDocxBuffer. */
  alignmentReport: AlignmentReport;

  /** Erreurs fatales (fail-loud). Vide si succès. */
  errors: string[];
}
```

### 3.4 `AlignmentReport` enrichi

```ts
export interface AlignmentReport {
  validationPassed: boolean;
  warnings: string[];
  detectedFields: DetectedFields;
  page1SectionsFound: string[];

  /** Sections requises absentes (de validateDocxBuffer). */
  missingRequiredSections: string[];

  /** Nombre de retries effectués avant succès / abandon. */
  retriesUsed: number;
}
```

### 3.5 Conductor pass (optionnel, hors v0.2)

À ajouter en v0.3 si le besoin se confirme : `TransposeInput.conductor?:
ConductorOptions` qui déclenche une seconde passe LLM comparant
`sourceText` vs texte rendu, retournant des `attention_traduction`
warnings. Pas dans le périmètre initial.

## 4. Implémentation côté `transpose()`

### 4.1 User prompt assemblé

Au lieu d'envoyer `userPrompt: rawText`, charger le template depuis
`core/spec/prompts/extract-cv.md` (section `# User prompt template`), et
interpoler :

```
${file.userPromptOverride ?? ''}

SOURCE FILENAME: ${file.name}
CV TEXT:
${rawText}
```

Le template du prompt vit déjà dans `core/spec/prompts/`. La parsing
markdown frontmatter+sections est trivial (slice sur les `# ` headers).

### 4.2 Streaming via callbacks

Deux options :

- **A.** Ajouter `LlmStreamingProvider extends LlmProvider` avec
  `completeStream(args, onDelta) → Promise<LlmCompleteResult>`.
- **B.** Ajouter `LlmCompleteArgs.onDelta?: (chunk) => void`. Plus simple,
  pas de nouvelle interface.

**Reco : B**. Un seul interface, opt-in côté caller. L'adapter
`adaptRegistryToCoreProvider` route vers `provider.generateStream` quand
`onDelta` est fourni, sinon `provider.generate`.

### 4.3 Validation + retry

Boucle interne dans `transpose()` :

1. Extract LLM → profile, usage.
2. Render DOCX → docxBytes.
3. validatePage1 + validateDocxBuffer → alignmentReport.
4. Si `alignmentReport.warnings.length > 0 || missingRequiredSections.length > 0` ET `retriesLeft > 0` :
   - Construire un user prompt amendé : "VALIDATION ERRORS: …; shorten skill descriptions to max 100 chars; reduce sectors to max 4".
   - Retour étape 1 avec nouveau prompt, decrement `retriesLeft`.
5. Sortie : `TransposedCv` complet.

### 4.4 `validateDocxBuffer` à porter

Déjà dans core (`docx/reader.ts` post-Task 14). Sa signature actuelle
`validateDocxBuffer(bytes, requiredSections: string[])` correspond. `transpose()`
appelle avec `manifest.sections.map(s => s.label)`.

## 5. Phasage

| Phase | Quoi | Justification |
|---|---|---|
| **v0.2.0** | Sections 3.1-3.4 + 4.1-4.3 du présent doc (user prompt assemblé, streaming opt-in, retry, output enrichi). | Suffit à migrer l'orchestrator web (Task 25 P1.1) sans régression. |
| **v0.3.0** | Section 3.5 (conductor pass) + tests d'équivalence renforcés. | Quand P1.4 ou P1.5 décide qu'ils en veulent. |

Hors-scope de cette spec : le port Python du cœur. P1.2 portera la
version v0.2.0 telle qu'elle (mêmes types en snake_case), avec ses
propres tests d'équivalence.

## 6. Tests

- Reprendre les fixtures `core/fixtures/cv-001-junior-pm.*`, ajouter
  cv-002 + cv-003 si pas déjà là, plus une fixture spécifique pour
  exercer le retry (un CV qui produit délibérément un overflow page 1
  au premier rendu).
- Tests unitaires nouveaux :
  - User prompt assembly : pour un `userPromptOverride` donné, le prompt
    envoyé au LLM contient la chaîne attendue.
  - Streaming callbacks : un fake `LlmProvider` qui simule des deltas
    appelle les callbacks dans le bon ordre.
  - Retry loop : un fake LLM qui renvoie un profil "trop long" au 1er
    tour et "OK" au 2nd tour valide la convergence en 1 retry.
- Smoke d'intégration avec l'adapter `adaptRegistryToCoreProvider` :
  configurer un provider Mistral réel sur 1 CV, vérifier qu'il streame
  via les callbacks.

## 7. Migration de l'orchestrator web (Task 25 P1.1, débloquée)

Une fois v0.2.0 livré :
- `api/src/services/orchestrator.ts::processOneCV` devient un wrapper
  d'~50 lignes autour d'un seul appel à `transpose()`.
- Les pré/post (decrypt, encrypt 48h, SSE bridge, batch summary,
  concurrency pool, tenant resolution) restent dans l'orchestrator.
- Le bridge `tenantConfigToTemplateAssets` (à créer dans api/) reste
  api-side puisqu'il dépend du `TenantConfig` shape.

## 8. Risques

| Risque | Mitigation |
|---|---|
| L'API publique de v0.2 diverge des consommateurs si on l'élargit trop. | Stricte semver discipline. `extraction` et `streamCallbacks` sont optionnels — pas de breaking change vs v0.1. |
| Streaming complique les agents marketplace (Copilot / Gemini ne streament pas dans le sandbox). | `streamCallbacks` est opt-in. Les agents marketplace passent `undefined` et restent en mode batch. |
| Le retry de validation amplifie les coûts LLM. | `maxValidationRetries` configurable, défaut 1. Téléchargeable par tenant si nécessaire. |
| Le port Python (P1.2) devra rattraper. | Acceptable : v0.1 reste valide pour P1.2 initial. Le port Python est upgradé en P1.2.5 quand v0.2 est stable côté TS. |

## 9. Hors-scope

- Migration `api/src/services/orchestrator.ts` : c'est la Task 25 P1.1
  qui se débloquera mécaniquement après v0.2.
- Port Python de v0.2 : à faire dans P1.2 ou P1.2.5.
- Conductor pass : différé à v0.3.
- Streaming pour les agents marketplace : non utilisé en v0.2 (les
  sandbox de Copilot et Gemini ne streament pas dans le runtime de
  l'agent ; ils pourront utiliser le mode batch).
