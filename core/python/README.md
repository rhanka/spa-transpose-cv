# cv_transpose_core Python

Python port of `@cv-transpose/core` for marketplace runtimes.

## Current Scope

- Mirrors `transpose()` v0.2 for the Scalian fixture path.
- Supports PDF and DOCX input.
- Rejects legacy `.doc` as `unsupported_mime`.
- Uses pure Python/package dependencies only: no LibreOffice, pandoc, pdftotext, shell commands, or network I/O inside the core.
- Runs structural DOCX validation. Page-1 LibreOffice validation remains TypeScript/API-only in this increment.

## Test

From the repo root:

```bash
make test-core-python
```
