/**
 * regen-goldens.ts — regenerate the canonical DOCX outputs in core/golden/.
 *
 * Run via tsx from the monorepo root:
 *
 *   docker compose -f docker-compose.yml -f docker-compose.dev.yml \
 *     run --rm --workdir /app api \
 *     npx tsx core/typescript/scripts/regen-goldens.ts
 *
 * Each entry in FIXTURES_TO_REGEN is paired with the scalian test template
 * fixture and a stub LlmProvider that returns the matching expected
 * extraction JSON. The script writes <fixture-id>.<template>.docx into
 * core/golden/.
 *
 * Goldens are the reference outputs for the equivalence test in
 * core/typescript/src/golden.test.ts. Regenerate them only after intentional
 * rendering changes, then `git add core/golden/`.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { transpose } from '../src/transpose.js';
import type {
  LlmProvider,
  TemplateAssets,
  TemplateManifest,
} from '../src/index.js';

const FIXTURES_TO_REGEN = [
  {
    id: 'cv-001-junior-pm',
    input: 'cv-001-junior-pm.pdf',
    mime: 'application/pdf' as const,
  },
  // Future: cv-002, cv-003 once their fixtures land.
];

const TEMPLATE_KEY = 'scalian';

// The script is invoked from the monorepo root (--workdir /app), so cwd is
// the repo root in dev. Resolve relative to cwd to keep this robust against
// tsx's URL handling.
const repoRoot = resolve(process.cwd());

const baseDocx = readFileSync(
  `${repoRoot}/core/fixtures/templates-test/${TEMPLATE_KEY}/base.docx`,
);
const manifest = JSON.parse(
  readFileSync(
    `${repoRoot}/core/fixtures/templates-test/${TEMPLATE_KEY}/manifest.json`,
    'utf8',
  ),
) as TemplateManifest;

const assets: TemplateAssets = {
  manifest,
  baseDocx: new Uint8Array(baseDocx),
  brand: {
    primary: '#0F2137',
    secondary: '#23344A',
    accent: '#7DB7E1',
    fontFamily: 'Lato',
  },
};

for (const fx of FIXTURES_TO_REGEN) {
  const expected = JSON.parse(
    readFileSync(
      `${repoRoot}/core/fixtures/${fx.id}.expected-extraction.json`,
      'utf8',
    ),
  );
  const cvBytes = readFileSync(`${repoRoot}/core/fixtures/${fx.input}`);
  const stubLlm: LlmProvider = {
    async complete() {
      return { text: JSON.stringify(expected) };
    },
  };
  const r = await transpose({
    files: [
      { name: fx.input, bytes: new Uint8Array(cvBytes), mime: fx.mime },
    ],
    template: assets,
    persistence: 'ephemeral',
    llm: stubLlm,
  });
  if (r.results[0]!.errors.length > 0) {
    throw new Error(`${fx.id}: ${r.results[0]!.errors.join('; ')}`);
  }
  const goldenPath = `${repoRoot}/core/golden/${fx.id}.${TEMPLATE_KEY}.docx`;
  mkdirSync(dirname(goldenPath), { recursive: true });
  writeFileSync(goldenPath, r.results[0]!.outputDocx);
  console.log(
    `golden written: ${fx.id}.${TEMPLATE_KEY}.docx (${r.results[0]!.outputDocx.length} bytes)`,
  );
}
