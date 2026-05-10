/**
 * Re-export shim — the real implementation lives in `@cv-transpose/core`
 * (`core/typescript/src/docx/font-embedding.ts`). This file exists only so
 * legacy api/ call-sites keep compiling. Will be removed in Task 26 once all
 * call-sites import from `@cv-transpose/core` directly.
 */
export * from '@cv-transpose/core';
