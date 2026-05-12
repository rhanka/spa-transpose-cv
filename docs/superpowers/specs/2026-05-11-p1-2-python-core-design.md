# P1.2 Python Core Design

Date: 2026-05-11
Status: approved design, pending implementation plan

## Goal

Add a first Python port of `@cv-transpose/core` under
`core/python/cv_transpose_core/` so marketplace agents can execute the CV
transpose pipeline inside Python-only runtimes without calling Sent Tech
compute for CV content.

The initial P1.2 scope mirrors the TypeScript `transpose()` v0.2 public
contract for the existing Scalian fixture and compares Python output against
the current TypeScript golden.

## Scope

Supported in P1.2:

- Public Python API equivalent to TS v0.2, using snake_case dataclasses.
- PDF and DOCX input handling.
- Explicit `.doc` rejection with `unsupported_mime`.
- Prompt assembly from `core/spec/prompts/extract-cv.md`.
- Injected async `LlmProvider.complete(...)`.
- CvData shape validation compatible with `core/typescript/src/cv/profile.ts`.
- Manifest validation and manifest-to-contract bridge for template manifest
  v1.
- DOCX rendering in memory from `base.docx` using Python stdlib `zipfile`
  plus XML tooling.
- Structural validation that required manifest section labels are present.
- Equivalence tests on `cv-001-junior-pm` + Scalian template.

Runtime dependencies are pure-Python or Python-package dependencies only:
`pypdf` for PDF text extraction, `lxml` for XML parsing/serialization, and
`python-docx` only where it simplifies inspection helpers. The Python core
does not call `pdftotext`, LibreOffice, pandoc, shell commands, or network
resources.

Out of scope for the first increment:

- `.doc` conversion.
- LibreOffice-dependent page-1 validation in the Python runtime.
- PNG/RMSE visual equivalence.
- Expanding the fixture corpus to 30 CVs.
- Backoffice assets API and marketplace agent wrappers.

## Public API

The Python package exposes `transpose(input_: TransposeInput) ->
TransposeOutput` from `cv_transpose_core.__init__`.

The dataclasses mirror Contract 1 with Python naming:

- `InputFile(name, bytes_, mime, user_prompt_override=None)`
- `BrandTokens(primary, secondary, accent, font_family)`
- `TemplateAssets(manifest, base_docx, brand)`
- `TransposeInput(files, template, persistence, llm, extraction=None,
  stream_callbacks=None)`
- `TransposedCv(source_file_name, output_docx_name, output_docx, profile,
  source_text, usage, alignment_report, errors)`

`LlmProvider` remains dependency-injected. The core performs no network I/O
except through `llm.complete(...)`.

## Pipeline

For each CV:

1. Extract text once.
   - PDF: use `pypdf` in memory; encrypted or unsupported PDFs produce a
     per-file extraction error.
   - DOCX: parse `word/document.xml` in memory.
   - DOC: return a per-file error `unsupported_mime`.
2. Build system and user prompts from `core/spec/prompts/extract-cv.md`.
3. Call the injected LLM provider and parse JSON into the CvData shape.
4. Render DOCX bytes from the tenant `base.docx` and manifest-derived
   contract.
5. Validate required section labels in the rendered DOCX text.
6. Retry once by default when structural validation reports findings, using
   the same validation-feedback prompt policy as TS v0.2.
7. Return enriched output: profile, source text, token usage, alignment
   report, output DOCX bytes, and per-file errors.

## Rendering Strategy

The renderer starts narrow:

- Preserve the input DOCX package entries from `base.docx`.
- Replace `word/document.xml` with generated OOXML equivalent to the TS
  Scalian/contract path for the existing fixture.
- Update `word/header2.xml` or `word/header1.xml` when present, matching the
  TS header field semantics.
- Keep deterministic XML serialization where possible so normalization can
  compare Python output to TS output.

This favors a small, testable OOXML generator over trying to use Word or
LibreOffice behavior in the marketplace runtime.

## Validation

Python P1.2 implements structural validation only:

- Extract all text from the rendered DOCX.
- Check each required section label from the manifest-derived contract.
- Return `missing_required_sections`, `page1_sections_found`, and
  `validation_passed`.

`validate-page1` is represented as a no-op warning source in Python P1.2. It
does not call LibreOffice and does not write large temporary files. Visual
page-fit validation remains a TypeScript/API concern until a pure-Python
approximation is specified.

## Equivalence Tests

Add Python tests under `core/python/tests/`:

- prompt assembly loads the same markdown sections as TS;
- manifest bridge accepts the Scalian fixture manifest;
- DOCX text extraction reads generated/fixture DOCX text;
- `transpose()` with a fake LLM using
  `core/fixtures/cv-001-junior-pm.expected-extraction.json` returns a DOCX
  and enriched result;
- normalized Python DOCX output equals the normalized TS golden for
  `word/document.xml` plus any present `word/header*.xml` entries.

Add shared normalization helpers following `core/spec/normalize-docx.md`.
Strict byte equality is not required; normalized OOXML entries and binary
hashes are the comparison surface.

All JS/TS validation commands continue to run through Docker only, preserving
the project constraint against native `npm`, `node`, `tsc`, `vitest`, and
`npx` on the host.

## Error Handling

Errors are captured per input where possible, matching TS `transpose()`:

- unsupported MIME: `unsupported_mime`;
- extraction failure: per-file error;
- malformed LLM JSON: per-file error with fallback profile;
- invalid manifest or unreadable `base.docx`: fatal error before processing
  files.

The Python core does not silently fall back to a generic template.

## Release Shape

The first complete P1.2 increment should leave the repo with:

- `core/python/cv_transpose_core/` package source;
- `core/python/tests/` unit and fixture tests;
- Python normalization helper;
- a Docker-safe test command documented in the plan;
- no production deployment, no tag, and no commit unless explicitly requested.

After P1.2 passes, the next likely step is to broaden fixtures before starting
P1.4/P1.5 agent wrappers.
