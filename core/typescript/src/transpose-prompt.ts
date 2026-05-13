/**
 * Per-CV prompt assembly for transpose().
 *
 * Loads the canonical extraction prompt from `core/spec/prompts/extract-cv.md`
 * (shared by all language ports) and assembles:
 *   - the system prompt (verbatim from the `# System prompt` section)
 *   - the user prompt (the rendered template from `# User prompt template`,
 *     with `${userPrompt}`, `${sourceFileName}`, `${cvText}` interpolated).
 *
 * Loading and parsing happen once on first use and are cached for the lifetime
 * of the process.
 */

import { readFileSync } from 'node:fs';

function readExtractPrompt(): string {
  const candidates = [
    // Source workspace: /app/core/typescript/src/transpose-prompt.ts
    new URL('../../../core/spec/prompts/extract-cv.md', import.meta.url),
    // Bundled API: /app/api/dist/index.js with /app/core/spec copied into the image.
    new URL('../../core/spec/prompts/extract-cv.md', import.meta.url),
  ];

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8');
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined;
      if (code !== 'ENOENT') {
        throw error;
      }
    }
  }

  throw new Error('Unable to load core/spec/prompts/extract-cv.md');
}

const EXTRACT_MD = readExtractPrompt();

interface PromptParts {
  system: string;
  userTemplate: string;
}

function parseExtractMd(md: string): PromptParts {
  // Strip YAML frontmatter (--- ... ---)
  const body = md.replace(/^---[\s\S]*?\n---\n/, '');

  // System prompt: everything between "# System prompt" and the next "# " heading.
  const systemMatch = body.match(/# System prompt\s*\n([\s\S]*?)(?=\n# |$)/);
  if (!systemMatch) {
    throw new Error('extract-cv.md missing "# System prompt" section');
  }
  const system = systemMatch[1].trim();

  // User prompt template: extract the rendered fenced code block inside
  // "# User prompt template". That block is the one whose first non-blank line
  // is `${userPrompt}` (the .ts code block above it shows assembly logic,
  // not the rendered template).
  const userSectionMatch = body.match(/# User prompt template\s*\n([\s\S]*?)(?=\n# |$)/);
  if (!userSectionMatch) {
    throw new Error('extract-cv.md missing "# User prompt template" section');
  }
  const userSection = userSectionMatch[1];

  // Find all fenced code blocks in the section.
  const fenceRegex = /```[a-zA-Z]*\n([\s\S]*?)\n```/g;
  let rendered: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = fenceRegex.exec(userSection)) !== null) {
    const content = m[1];
    // The rendered template starts with the `${userPrompt}` placeholder
    // (no `const userMessage = ...` TS scaffold).
    if (content.trimStart().startsWith('${userPrompt}')) {
      rendered = content;
      break;
    }
  }

  if (rendered === null) {
    throw new Error(
      'extract-cv.md "# User prompt template" missing the rendered fenced block starting with ${userPrompt}',
    );
  }

  return { system, userTemplate: rendered };
}

const PARSED = parseExtractMd(EXTRACT_MD);

export function buildSystemPrompt(): string {
  return PARSED.system;
}

export interface BuildUserPromptArgs {
  cvText: string;
  sourceFileName: string;
  userPromptOverride?: string;
}

/**
 * Assemble the per-CV user prompt by interpolating the rendered template from
 * `core/spec/prompts/extract-cv.md`.
 *
 * Mirrors the legacy `extractCvData()` assembly: when `userPromptOverride` is
 * empty/undefined, the leading block (and the blank line that followed it)
 * is removed so the prompt does not start with a stray newline.
 */
export function buildUserPrompt(args: BuildUserPromptArgs): string {
  const override = args.userPromptOverride ?? '';
  let result = PARSED.userTemplate
    .replace(/\$\{userPrompt\}/g, override)
    .replace(/\$\{sourceFileName\}/g, args.sourceFileName)
    .replace(/\$\{cvText\}/g, args.cvText);

  // When userPromptOverride is empty, the legacy code path filtered the empty
  // string out before joining with '\n\n', so the prompt did not start with a
  // blank section. Reproduce that here: strip leading whitespace/newlines.
  if (override === '') {
    result = result.replace(/^\s*\n+/, '');
  }

  return result;
}
