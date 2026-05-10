# P1.5-bis — `transpose()` extensions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Étendre l'API publique `transpose()` de `@cv-transpose/core` (v0.1 → v0.2) avec assemblage du user prompt par CV, streaming callbacks opt-in, retry sur feedback de validation, validation structurelle DOCX, et enrichissement de la sortie (profile, sourceText, usage). Migrer ensuite `api/src/services/orchestrator.ts` pour qu'il délègue à `transpose()` sans régression UX (streaming SSE, ligne FinOps, retries, target-company tailoring).

**Architecture:** Extensions strictement opt-in côté API publique. Aucune cassure de v0.1 — tous les nouveaux champs sont optionnels. Le retry et la validation structurelle vivent dans `transpose()`. Le streaming passe par un callback optionnel passé en `TransposeInput.streamCallbacks` qui est routé en interne vers `LlmCompleteArgs.onDelta` (extension de `LlmProvider`).

**Tech Stack:** TypeScript, Vitest (tests), `@xmldom/xmldom` + `jszip` (déjà en place pour OOXML), Docker Compose (toute commande passe par container, contrainte projet).

---

## Preconditions

- Le plan **exécute depuis une nouvelle branche `feat/transpose-v0.2` créée à partir de `master`**.
- Toute commande `npm` / `node` / `tsc` / `vitest` est exécutée **dans un container Docker** via `docker compose run --rm --workdir /app api /app/node_modules/.bin/<binary>` ou `docker compose exec` (contrainte projet).
- Master contient déjà P1.1 (commit `f4c37df`) : `core/` avec `transpose()` v0.1, fixtures cv-001, golden DOCX, manifest schema, etc. + l'orchestrator.ts api qui fait encore son propre pipeline. Spec parent : `spec/SPEC_EVOL_TRANSPOSE_EXTENSIONS.md`.
- Le tag `core-v0.1.0` pointe sur le commit P1.1 d'origine (sur une branche déjà supprimée). Le nouveau tag à la fin de ce plan sera `core-v0.2.0` sur le commit final de cette branche.

## File structure delta

**Modifiés :**
```
core/typescript/src/
  ├── types.ts                        # +InputFile.userPromptOverride, +TransposeInput.extraction/streamCallbacks, +TransposedCv.profile/sourceText/usage, +AlignmentReport.missingRequiredSections/retriesUsed, +TransposePhase
  ├── llm.ts                          # +LlmCompleteArgs.onDelta, +LlmCompleteResult étoffé (thinking_delta hook)
  ├── transpose.ts                    # assemblage user prompt, streaming relay, retry loop, sourceText/usage propagation
  ├── transpose.test.ts               # nouveaux cas : userPromptOverride, streaming, retry
  └── validate/
      └── docx-structure.ts           # NOUVEAU : portage de validateDocxBuffer → API stable
core/typescript/src/validate/
  └── docx-structure.test.ts          # NOUVEAU
api/src/services/
  ├── llm/adapt-to-core.ts            # route generateStream quand onDelta est passé, lit enableReasoning/reasoningBudget
  └── orchestrator.ts                 # MIGRATION : délègue à core.transpose() au lieu de la pipeline locale
api/src/services/
  └── tenant-template-assets.ts       # NOUVEAU : bridge TenantConfig → TemplateAssets (manifest + baseDocx + brand)
core/typescript/package.json          # version 0.1.0 → 0.2.0
```

**Inchangés mais audités :**
- `core/typescript/src/extract/text.ts`
- `core/typescript/src/template/render.ts`
- `core/typescript/src/template/bridge.ts`
- `core/typescript/src/validate/page1.ts`
- `core/typescript/src/cv/profile.ts`
- `core/spec/prompts/extract-cv.md` (le user prompt template y est défini)

---

## Tasks

### Task 1 — Préparer la branche d'exécution

**Files:**
- Branche : `feat/transpose-v0.2` depuis `master`

- [ ] **Step 1: Créer la branche**

```bash
git fetch origin
git checkout -b feat/transpose-v0.2 origin/master
```

- [ ] **Step 2: Vérifier le baseline**

```bash
test -f core/typescript/src/transpose.ts && test -f api/src/services/orchestrator.ts && echo OK
```

- [ ] **Step 3: Push initial**

```bash
git push -u origin feat/transpose-v0.2
```

### Task 2 — Étendre les types publics

**Files:**
- Modify: `core/typescript/src/types.ts`
- Modify: `core/typescript/src/llm.ts`
- Modify: `core/typescript/src/index.ts` (s'assurer que les nouveaux types sont exportés)

- [ ] **Step 1: Étendre `InputFile`**

Dans `core/typescript/src/types.ts`, ajouter à `InputFile` :
```ts
export interface InputFile {
  name: string;
  bytes: Uint8Array;
  mime: CvMime;
  /** Optionnel : prompt utilisateur par CV (tailoring target-company, etc.).
   *  Inséré à la place de `{userPrompt}` dans le template de prompt user. */
  userPromptOverride?: string;
}
```

- [ ] **Step 2: Ajouter `TransposePhase`**

```ts
export type TransposePhase =
  | 'extract-text'
  | 'extract-cv-llm'
  | 'render-docx'
  | 'validate-page1'
  | 'validate-structural'
  | 'retry'
  | 'done';
```

- [ ] **Step 3: Étendre `TransposeInput`**

```ts
export interface TransposeInput {
  files: InputFile[];
  template: TemplateAssets;
  persistence: Persistence;
  llm: LlmProvider;
  extraction?: {
    reasoningBudget?: number;
    enableReasoning?: boolean;
    maxValidationRetries?: number;
  };
  streamCallbacks?: {
    onPhaseChange?: (file: string, phase: TransposePhase) => void;
    onThinkingDelta?: (file: string, delta: string) => void;
    onContentDelta?: (file: string, delta: string) => void;
    onParsedKeys?: (file: string, keys: string[]) => void;
  };
}
```

- [ ] **Step 4: Étendre `TransposedCv`**

```ts
import type { CvData } from './cv/profile.js';

export interface TransposedCv {
  sourceFileName: string;
  outputDocxName: string;
  outputDocx: Uint8Array;
  profile: CvData;
  sourceText: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  alignmentReport: AlignmentReport;
  errors: string[];
}
```

- [ ] **Step 5: Étendre `AlignmentReport`**

```ts
export interface AlignmentReport {
  validationPassed: boolean;
  warnings: string[];
  detectedFields: DetectedFields;
  page1SectionsFound: string[];
  missingRequiredSections: string[];
  retriesUsed: number;
}
```

- [ ] **Step 6: Étendre `LlmCompleteArgs` et `LlmCompleteResult`**

Dans `core/typescript/src/llm.ts` :
```ts
export interface LlmCompleteArgs {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  enableReasoning?: boolean;
  reasoningBudget?: number;
  onDelta?: (delta: { kind: 'thinking' | 'content'; text: string }) => void;
}

export interface LlmCompleteResult {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
}
```

- [ ] **Step 7: Typecheck + tests existants doivent encore passer**

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --workdir /app api npx tsc -p core/typescript/tsconfig.json --noEmit
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --workdir /app api /app/node_modules/.bin/vitest run --root /app/core/typescript
```

- [ ] **Step 8: Commit**

```bash
git add core/typescript/src/types.ts core/typescript/src/llm.ts core/typescript/src/index.ts
git commit -m "feat(core): extend transpose API surface for v0.2 (opt-in streaming, retry, enriched output)"
```

### Task 3 — Implémenter le validator structurel `docx-structure.ts`

**Files:**
- Create: `core/typescript/src/validate/docx-structure.ts`
- Create: `core/typescript/src/validate/docx-structure.test.ts`

- [ ] **Step 1: Test (TDD red)**

`core/typescript/src/validate/docx-structure.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateDocxStructure } from './docx-structure.js';

const golden = readFileSync(new URL('../../../golden/cv-001-junior-pm.scalian.docx', import.meta.url));

describe('validateDocxStructure', () => {
  it('finds required section labels when present', async () => {
    const r = await validateDocxStructure(new Uint8Array(golden), [
      'TECHNICAL SKILLS', 'SECTOR-SPECIFIC SKILLS', 'WORK EXPERIENCE'
    ]);
    expect(r.missing).toEqual([]);
  });

  it('reports missing section labels', async () => {
    const r = await validateDocxStructure(new Uint8Array(golden), ['NEVER_PRESENT']);
    expect(r.missing).toContain('NEVER_PRESENT');
  });
});
```

- [ ] **Step 2: Implémenter**

Lire `core/typescript/src/docx/reader.ts::extractTextFromDocx` qui sait extraire du texte d'un DOCX en mémoire. Puis :

`core/typescript/src/validate/docx-structure.ts` :
```ts
import { extractTextFromDocxBuffer } from '../docx/reader.js';

export interface DocxStructureValidation {
  missing: string[];
  found: string[];
}

export async function validateDocxStructure(
  docxBytes: Uint8Array,
  requiredSectionLabels: string[]
): Promise<DocxStructureValidation> {
  const text = await extractTextFromDocxBuffer(Buffer.from(docxBytes));
  const upper = text.toUpperCase();
  const missing: string[] = [];
  const found: string[] = [];
  for (const label of requiredSectionLabels) {
    if (upper.includes(label.toUpperCase())) found.push(label);
    else missing.push(label);
  }
  return { missing, found };
}
```

Si `extractTextFromDocxBuffer` n'existe pas, ajouter une fonction `extractTextFromDocxBuffer(buffer): Promise<string>` à côté de l'existante `extractTextFromDocx(path)` dans `core/typescript/src/docx/reader.ts` — adapter à l'API jszip qui prend un buffer directement.

- [ ] **Step 3: Run + verify**

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --workdir /app api /app/node_modules/.bin/vitest run --root /app/core/typescript docx-structure
```

- [ ] **Step 4: Re-export depuis `core/typescript/src/index.ts`**

```ts
export * from './validate/docx-structure.js';
```

- [ ] **Step 5: Commit**

```bash
git add core/typescript/src/validate/docx-structure.ts core/typescript/src/validate/docx-structure.test.ts core/typescript/src/index.ts core/typescript/src/docx/reader.ts
git commit -m "feat(core): add validateDocxStructure for required section presence check"
```

### Task 4 — Assemblage du user prompt dans `transpose()`

**Files:**
- Modify: `core/typescript/src/transpose.ts`
- Create: `core/typescript/src/transpose-prompt.ts` (helper isolé pour tester)
- Modify: `core/typescript/src/transpose.test.ts`

- [ ] **Step 1: Helper d'assemblage**

`core/typescript/src/transpose-prompt.ts` :
```ts
import { readFileSync } from 'node:fs';

const EXTRACT_MD = readFileSync(
  new URL('../../../core/spec/prompts/extract-cv.md', import.meta.url),
  'utf8'
);

/** Parse extract-cv.md frontmatter sections (# System prompt, # User prompt template). */
function parseExtractMd(): { system: string; userTemplate: string } {
  // Strip frontmatter
  const body = EXTRACT_MD.replace(/^---[\s\S]*?---\n/, '');
  const systemMatch = body.match(/# System prompt\n([\s\S]*?)(?=\n# |$)/);
  const userMatch = body.match(/# User prompt template\n([\s\S]*?)(?=\n# |$)/);
  return {
    system: systemMatch?.[1]?.trim() ?? body.trim(),
    userTemplate: userMatch?.[1]?.trim() ?? '${cvText}',
  };
}

const PARSED = parseExtractMd();

export function buildSystemPrompt(): string {
  return PARSED.system;
}

export function buildUserPrompt(opts: {
  cvText: string;
  sourceFileName: string;
  userPromptOverride?: string;
}): string {
  return PARSED.userTemplate
    .replace(/\$\{userPrompt\}/g, opts.userPromptOverride ?? '')
    .replace(/\$\{sourceFileName\}/g, opts.sourceFileName)
    .replace(/\$\{cvText\}/g, opts.cvText);
}
```

- [ ] **Step 2: Test du helper**

`core/typescript/src/transpose-prompt.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserPrompt } from './transpose-prompt.js';

describe('transpose prompt assembly', () => {
  it('system prompt is non-empty', () => {
    expect(buildSystemPrompt().length).toBeGreaterThan(100);
  });

  it('user prompt interpolates fileName and text', () => {
    const p = buildUserPrompt({ cvText: 'X CV CONTENT', sourceFileName: 'cv-007.pdf', userPromptOverride: '' });
    expect(p).toContain('cv-007.pdf');
    expect(p).toContain('X CV CONTENT');
  });

  it('user prompt injects userPromptOverride', () => {
    const p = buildUserPrompt({ cvText: 'x', sourceFileName: 'a.pdf', userPromptOverride: 'TARGET: Acme Corp' });
    expect(p).toContain('TARGET: Acme Corp');
  });
});
```

- [ ] **Step 3: Intégrer dans transpose.ts**

Remplacer l'appel `input.llm.complete({ systemPrompt: EXTRACT_PROMPT, userPrompt: rawText, ... })` actuel par :
```ts
const llmResp = await input.llm.complete({
  systemPrompt: buildSystemPrompt(),
  userPrompt: buildUserPrompt({
    cvText: rawText,
    sourceFileName: file.name,
    userPromptOverride: file.userPromptOverride,
  }),
  maxTokens: 8192,
  temperature: 0.1,
  enableReasoning: input.extraction?.enableReasoning,
  reasoningBudget: input.extraction?.reasoningBudget,
  onDelta: input.streamCallbacks ? makeDeltaForwarder(file.name, input.streamCallbacks) : undefined,
});
```

Avec un helper local :
```ts
function makeDeltaForwarder(fileName: string, cb: NonNullable<TransposeInput['streamCallbacks']>) {
  return (delta: { kind: 'thinking' | 'content'; text: string }) => {
    if (delta.kind === 'thinking') cb.onThinkingDelta?.(fileName, delta.text);
    else cb.onContentDelta?.(fileName, delta.text);
  };
}
```

- [ ] **Step 4: Run + commit**

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --workdir /app api /app/node_modules/.bin/vitest run --root /app/core/typescript transpose
git add core/typescript/src/transpose.ts core/typescript/src/transpose-prompt.ts core/typescript/src/transpose-prompt.test.ts core/typescript/src/transpose.test.ts
git commit -m "feat(core): assemble per-CV user prompt in transpose() (override + sourceFileName + cvText)"
```

### Task 5 — Output enrichi : profile, sourceText, usage

**Files:**
- Modify: `core/typescript/src/transpose.ts`
- Modify: `core/typescript/src/transpose.test.ts`

- [ ] **Step 1: Propager `sourceText` et `profile`**

Dans la boucle `for (const file of input.files)` :
```ts
const rawText = await extractTextFromBuffer(Buffer.from(file.bytes), file.name);
input.streamCallbacks?.onPhaseChange?.(file.name, 'extract-cv-llm');

const llmResp = await input.llm.complete({ ... });
const profile = cvDataSchema.parse(JSON.parse(llmResp.text));
input.streamCallbacks?.onParsedKeys?.(file.name, Object.keys(profile));

// ... render, validate

results.push({
  sourceFileName: file.name,
  outputDocxName,
  outputDocx,
  profile,
  sourceText: rawText,
  usage: {
    inputTokens: llmResp.usage?.inputTokens ?? 0,
    outputTokens: llmResp.usage?.outputTokens ?? 0,
    totalTokens: (llmResp.usage?.inputTokens ?? 0) + (llmResp.usage?.outputTokens ?? 0),
  },
  alignmentReport,
  errors,
});
```

Si `cvDataSchema` parse échoue, mettre les erreurs dans `errors[]` et conserver `profile` comme un cast safe-default (`{} as CvData`) — c'est une fail-loud mais on garde un objet TransposedCv structuré.

- [ ] **Step 2: Test enrichi**

Étendre `transpose.test.ts` :
```ts
it('returns profile, sourceText and usage', async () => {
  const r = await transpose({ /* ... */ });
  const cv = r.results[0];
  expect(cv.profile.name).toBe('Jane Smith');
  expect(cv.sourceText.length).toBeGreaterThan(50);
  expect(cv.usage.totalTokens).toBeGreaterThanOrEqual(0);
});
```

- [ ] **Step 3: Run + commit**

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --workdir /app api /app/node_modules/.bin/vitest run --root /app/core/typescript transpose
git add core/typescript/src/transpose.ts core/typescript/src/transpose.test.ts
git commit -m "feat(core): enrich TransposedCv with profile, sourceText, usage (v0.2)"
```

### Task 6 — Boucle de retry sur feedback de validation

**Files:**
- Modify: `core/typescript/src/transpose.ts`
- Modify: `core/typescript/src/transpose.test.ts`

- [ ] **Step 1: Refactor en `processSingleCv` interne**

Dans `transpose.ts`, extraire la logique per-CV dans une fonction interne `processSingleCv(file, input, contract)` qui retourne `TransposedCv`. La boucle `for (file of files)` appelle juste cette fonction. Cela facilite le retry.

- [ ] **Step 2: Boucle retry**

Dans `processSingleCv`, après extract+render+validate :
```ts
const maxRetries = input.extraction?.maxValidationRetries ?? 1;
let retriesUsed = 0;
let alignmentReport: AlignmentReport;
let outputDocx: Uint8Array;
let userPromptOverride = file.userPromptOverride;

while (true) {
  // ... extract LLM → profile, usage
  // ... render → outputDocx
  alignmentReport = await runValidation(outputDocx, contract, manifest);

  if (alignmentReport.warnings.length === 0 && alignmentReport.missingRequiredSections.length === 0) break;
  if (retriesUsed >= maxRetries) break;

  retriesUsed++;
  input.streamCallbacks?.onPhaseChange?.(file.name, 'retry');
  userPromptOverride = (file.userPromptOverride ?? '') +
    `\n\nVALIDATION ERRORS: ${[
      ...alignmentReport.warnings,
      ...alignmentReport.missingRequiredSections.map(s => `Missing required section "${s}"`)
    ].join('; ')}\n` +
    `Shorten all skill descriptions to max 100 characters. Reduce sectors to max 4. Reduce domains to max 4.`;
}

alignmentReport.retriesUsed = retriesUsed;
```

Avec un helper `runValidation(docxBytes, contract, manifest): Promise<AlignmentReport>` qui combine `validatePage1` + `validateDocxStructure`.

- [ ] **Step 3: Test retry avec fake LLM**

```ts
it('retries once when first render misses a required section', async () => {
  let calls = 0;
  const flakyLlm: LlmProvider = {
    async complete() {
      calls++;
      // 1er appel renvoie un profil avec très peu de skills → validation rate
      // 2e appel renvoie le profil complet
      const profile = calls === 1
        ? { name: 'X', title_line1: 'a', title_line2: 'b', years: 1, experiences: [], skills: [], education: [], languages: [], certifications: [], attention_cv: '' }
        : { /* full profile from cv-001 */ };
      return { text: JSON.stringify(profile) };
    },
  };
  const r = await transpose({ files: [...], template: ..., persistence: 'ephemeral', llm: flakyLlm, extraction: { maxValidationRetries: 1 } });
  expect(r.results[0].alignmentReport.retriesUsed).toBeGreaterThanOrEqual(1);
});
```

Tolérer que la condition exacte de "miss" dépende de la structure du template-test ; ajuster le profil "court" pour qu'il déclenche réellement un missing.

- [ ] **Step 4: Run + commit**

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --workdir /app api /app/node_modules/.bin/vitest run --root /app/core/typescript transpose
git add core/typescript/src/transpose.ts core/typescript/src/transpose.test.ts
git commit -m "feat(core): retry loop on validation feedback (configurable maxValidationRetries)"
```

### Task 7 — Validation `runValidation` (page1 + structural)

**Files:**
- Modify: `core/typescript/src/transpose.ts` (extraire helper `runValidation`)

- [ ] **Step 1: Helper interne**

```ts
async function runValidation(
  docxBytes: Uint8Array,
  manifest: TemplateManifest
): Promise<AlignmentReport> {
  const experienceLabel = manifest.sections.find(s => s.kind === 'experiences')?.label ?? null;
  const sectorLabel = manifest.sections.find(s => s.kind === 'skills')?.label ?? null;
  const requiredLabels = manifest.sections.map(s => s.label);

  const page1 = await validatePage1(docxBytes, {
    experienceSectionLabel: experienceLabel,
    sectorSectionLabel: sectorLabel,
  });
  const structure = await validateDocxStructure(docxBytes, requiredLabels);

  return {
    validationPassed: page1.warnings.length === 0 && structure.missing.length === 0,
    warnings: page1.warnings,
    detectedFields: { /* derived from current call-site */ },
    page1SectionsFound: structure.found,
    missingRequiredSections: structure.missing,
    retriesUsed: 0,  // set by the caller after the loop
  };
}
```

`detectedFields` reste construit dans `processSingleCv` après le LLM (puisque ça vient du profile, pas du DOCX rendu).

- [ ] **Step 2: Run + commit**

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --workdir /app api /app/node_modules/.bin/vitest run --root /app/core/typescript
git add core/typescript/src/transpose.ts
git commit -m "refactor(core): runValidation combines page1 + structural checks"
```

### Task 8 — Adapter `adaptRegistryToCoreProvider` étendu

**Files:**
- Modify: `api/src/services/llm/adapt-to-core.ts`
- Modify: `api/src/services/llm/adapt-to-core.test.ts`

- [ ] **Step 1: Router vers generateStream quand onDelta est fourni**

```ts
import type { LlmProvider, LlmCompleteArgs, LlmCompleteResult } from '@cv-transpose/core';
import { getActiveProvider } from './registry.js';

export function adaptRegistryToCoreProvider(opts: { provider?: string }): LlmProvider {
  return {
    async complete(args: LlmCompleteArgs): Promise<LlmCompleteResult> {
      const concrete = await getActiveProvider(opts.provider);
      const req = {
        system: args.systemPrompt,
        userMessage: args.userPrompt,
        maxTokens: args.maxTokens ?? 16000,
        enableReasoning: args.enableReasoning,
        reasoningBudget: args.reasoningBudget,
      };

      if (args.onDelta) {
        const r = await concrete.generateStream(req, {
          onThinking: (text) => args.onDelta!({ kind: 'thinking', text }),
          onContent: (text) => args.onDelta!({ kind: 'content', text }),
        });
        return { text: r.text, usage: r.usage ? { inputTokens: r.usage.input_tokens, outputTokens: r.usage.output_tokens } : undefined };
      }

      const r = await concrete.generate(req);
      return { text: r.text, usage: r.usage ? { inputTokens: r.usage.input_tokens, outputTokens: r.usage.output_tokens } : undefined };
    }
  };
}
```

Ajuster aux noms exacts des callbacks de `generateStream` côté api (lire `api/src/services/llm/types.ts` et au moins un provider pour confirmer).

- [ ] **Step 2: Test : onDelta route bien**

Mocker `getActiveProvider` pour retourner un fake qui appelle `onThinking`/`onContent` et vérifier que `onDelta` les reçoit.

- [ ] **Step 3: Run + commit**

```bash
make test-api
git add api/src/services/llm/adapt-to-core.ts api/src/services/llm/adapt-to-core.test.ts
git commit -m "feat(api): adapt-to-core routes streaming + reasoning to underlying provider"
```

### Task 9 — Bridge `tenantConfigToTemplateAssets`

**Files:**
- Create: `api/src/services/tenant-template-assets.ts`
- Create: `api/src/services/tenant-template-assets.test.ts`

- [ ] **Step 1: Test**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tenantConfigToTemplateAssets } from './tenant-template-assets.js';

test('tenantConfigToTemplateAssets builds a valid TemplateAssets', () => {
  const tc = { /* minimal TenantConfig fixture */ };
  const baseDocx = new Uint8Array([0x50, 0x4B, 0x03, 0x04]);
  const assets = tenantConfigToTemplateAssets(tc, baseDocx);
  assert.equal(assets.manifest.version, '1.0');
  assert.equal(assets.manifest.tenantKey.startsWith('direct:'), true);
  assert.ok(assets.brand.primary);
});
```

- [ ] **Step 2: Implémenter**

`api/src/services/tenant-template-assets.ts` (cf. spec/SPEC_EVOL_TRANSPOSE_EXTENSIONS.md §4.4 pour la forme exacte). Ce bridge est api-side car il dépend du shape `TenantConfig`.

- [ ] **Step 3: Test + commit**

```bash
make test-api
git add api/src/services/tenant-template-assets.ts api/src/services/tenant-template-assets.test.ts
git commit -m "feat(api): tenantConfigToTemplateAssets bridge for transpose() consumption"
```

### Task 10 — Migrer `orchestrator.ts` pour déléguer à `transpose()`

**Files:**
- Modify: `api/src/services/orchestrator.ts`

- [ ] **Step 1: Lecture + plan**

Lire `api/src/services/orchestrator.ts` actuel (assez gros). Identifier `processOneCV` (ou équivalent) et les concerns à conserver autour : décrypt session, encrypt résultat, émission SSE, batch summary, concurrency pool.

- [ ] **Step 2: Remplacer le pipeline interne**

Au cœur de `processOneCV`, remplacer la séquence (extract → cv-agent → render → validate) par un appel unique `transpose()`. Câbler :
- `files: [{ name, bytes: decrypted, mime }]`
- `template: tenantConfigToTemplateAssets(tenantConfig, baseDocxBytes)`
- `persistence: 'session'`
- `llm: adaptRegistryToCoreProvider({ provider: env.LLM_PROVIDER })`
- `extraction: { reasoningBudget: 4096, enableReasoning: true, maxValidationRetries: 1 }`
- `streamCallbacks: { onPhaseChange, onThinkingDelta, onContentDelta, onParsedKeys }` qui émettent les SSE events existants.

La sortie `TransposedCv` apporte : `outputDocx`, `profile`, `sourceText`, `usage`, `alignmentReport`. L'orchestrator continue à encrypter `outputDocx`, calcule le `tokenInfo` (`costUsd, co2Grams, ledMinutes`) depuis `usage`, propage `profile.attention_cv` dans le `done` SSE event, etc.

Le conductor pass (`conductorValidate`) peut soit rester un appel séparé dans l'orchestrator (il prend `sourceText` + le DOCX généré), soit être déplacé dans transpose() v0.3 plus tard. Pour ce plan, le garder dans l'orchestrator.

- [ ] **Step 3: Supprimer le code mort**

Après le passage à `transpose()`, les imports devenus dead côté orchestrator : `extractCvDataWithRetry`, `cv-agent`, `validateDocxBuffer`, `validatePage1WithPdf` (déjà dans core), les helpers OOXML (`buildTemplateDocumentXml` etc.), `validatePage1`. Tous viennent maintenant via transpose ou ne sont plus nécessaires.

- [ ] **Step 4: Build + smoke**

```bash
TARGET=production docker compose build --no-cache api
make up
sleep 12
curl -fsS http://localhost:8686/api/health && echo OK
make down
```

- [ ] **Step 5: UAT manuelle (1 CV réel, SSE actif)**

Lancer un upload de CV via l'UI ou en curl multipart, vérifier que :
- la barre de progression streame du thinking/content
- le DOCX rendu sort
- la ligne FinOps (cost/CO2) apparaît
- pas de régression du `attention_cv` dans le résumé

- [ ] **Step 6: Commit**

```bash
git add api/src/services/orchestrator.ts
git commit -m "refactor(api): orchestrator delegates per-CV pipeline to core.transpose()"
```

### Task 11 — Bump version core + tag

**Files:**
- Modify: `core/typescript/package.json` (version 0.1.0 → 0.2.0)
- Tag: `core-v0.2.0` (annoté)

- [ ] **Step 1: Bump**

`core/typescript/package.json` :
```json
"version": "0.2.0"
```

- [ ] **Step 2: Commit + tag + push**

```bash
git add core/typescript/package.json
git commit -m "chore(core): release 0.2.0"
git tag -a core-v0.2.0 -m "Core v0.2.0 — per-CV user prompt, opt-in streaming, validation retry, enriched output"
git push origin feat/transpose-v0.2 core-v0.2.0
```

### Task 12 — Ouvrir la PR

**Files:**
- PR GitHub : `feat/transpose-v0.2 → master`

- [ ] **Step 1: PR draft via gh**

```bash
gh pr create --draft --base master --head feat/transpose-v0.2 \
  --title "core-v0.2.0: transpose() extensions (streaming, retry, enriched output) + orchestrator migration" \
  --body "Voir spec/SPEC_EVOL_TRANSPOSE_EXTENSIONS.md."
```

- [ ] **Step 2: CI verte avant de retirer le draft**

Si une CI (GitHub Actions) tourne, attendre vert avant `gh pr ready`.

---

## Self-review

- **Spec coverage** : sections 3.1-3.4 (types), 3.5 (conductor) restera v0.3, 4.1 (assembly), 4.2 (streaming), 4.3 (retry), 4.4 (validateDocx) toutes couvertes par les Tasks 2-9. Migration orchestrator (§7) = Task 10. Phasage v0.2 (§5) respecté.
- **Placeholders** : aucun TBD littéral. Quelques sites disent "ajuster aux noms exacts" — ce sont des appels à la rigueur lors de l'exécution, pas des trous.
- **Cohérence types** : `LlmProvider`, `LlmCompleteArgs`, `TransposedCv`, `AlignmentReport`, `TransposePhase` utilisés tels que définis Task 2 → puis consommés Tasks 4-10.
- **Périmètre** : 12 tasks, ~6-10 commits, single branche. Pas d'ouverture vers P1.2 (Python) ou P1.3 (backoffice) — strictement v0.2 + migration.

---

## Execution Handoff

**Deux options d'exécution :**

1. **Subagent-Driven (recommandée)** — `superpowers:subagent-driven-development` : un subagent par task, review entre chaque, ~2-3 h d'exécution autonome.
2. **Inline Execution** — `superpowers:executing-plans` : exécution dans la session, batch avec checkpoints, ~plus rapide en wall-clock mais context-heavy.

À déclencher quand tu veux. Le plan reste un document de référence sur `master` jusqu'à ce moment.
