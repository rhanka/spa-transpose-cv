# cv_transpose_core Python

Python port of `@cv-transpose/core` for marketplace runtimes.

The same folder now also hosts `cv_transpose_marketplace`, a small shared
helper package for marketplace adapters (tenant-key derivation from identity
claims, backoffice asset loading).

## Current Scope

- Mirrors `transpose()` v0.2 for the Scalian fixture path.
- Supports PDF and DOCX input.
- Marketplace wrappers reject legacy `.doc` early with a structured input error.
- Uses pure Python/package dependencies only: no LibreOffice, pandoc, pdftotext, shell commands, or network I/O inside the core.
- Runs structural DOCX validation and the same warning/retry plumbing shape as TS for `validate-page1`.
- The concrete page-1 detector remains a pure-Python no-op in this increment; LibreOffice page-1 validation stays TypeScript/API-only.

## Test

From the repo root:

```bash
make test-core-python
```
