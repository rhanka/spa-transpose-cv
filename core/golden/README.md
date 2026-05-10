# core/golden — frozen DOCX outputs

Each file is a DOCX produced by `transpose()` for a specific fixture +
template combo, captured at a known-good state. The equivalence test
in `core/typescript/src/golden.test.ts` verifies that today's `transpose()`
still produces a structurally-equivalent DOCX.

## Regenerate after intentional rendering changes

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml \
  run --rm --workdir /app api \
  /app/api/node_modules/.bin/tsx core/typescript/scripts/regen-goldens.ts
```

Then `git add core/golden/ && git commit -m "test(core): regenerate goldens after <change>"`.

## Naming

`<fixture-id>.<template-key>.docx` — e.g. `cv-001-junior-pm.scalian.docx`.

## Don't edit by hand

Goldens are generator-output. Editing them manually defeats the purpose;
regenerate via the script if you need to update them.

## Determinism

The current `transpose()` renderer is not byte-deterministic (DOCX
contains some IDs / timestamps that vary between runs). The equivalence
test therefore falls back to a structural check (size within 5% + valid
ZIP magic) when byte-equality fails. The `normalize_docx` helper that
would let us strict-compare goldens is in scope of P1.2 (Python port +
equivalence tests).
