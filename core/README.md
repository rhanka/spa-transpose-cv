# core/ — moteur CV Transpose partagé

Source de vérité du comportement consommée par les trois shells (web,
agent MS Copilot, agent Gemini Enterprise).

- `spec/` : prompts, workflow, validation rules, JSON Schema. Source de
  vérité du comportement.
- `typescript/` : port TS consommé par le shell web via npm workspace.
- `python/` : (à venir P1.2) port Python pour les agents marketplace.
- `fixtures/` + `golden/` : CVs canoniques et sorties attendues pour les
  tests d'équivalence.

Contrats partagés : voir `spec/SPEC_EVOL_MULTI_MARKETPLACE_INTERFACES.md`.

Versioning : tag Git annoté `core-vX.Y.Z` du monorepo.
