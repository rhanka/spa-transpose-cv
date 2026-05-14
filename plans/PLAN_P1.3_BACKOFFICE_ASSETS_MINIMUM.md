# P1.3 — Backoffice marketplace + assets API (minimum unblocker) Implementation Plan

> Plan d'execution minimal pour debloquer P1.4 Copilot et P1.5 Gemini sans ouvrir tout le portail enterprise d'un coup.

**Goal:** ajouter le plus petit socle P1.3 qui rende possible un runtime marketplace Python autonome: un `tenantKey` canonique, une API read-only d'assets (`manifest`, `base.docx`, `brand`), et une auth JWT `RS256`/JWKS conforme au Contrat 3.

**In scope pour ce slice:**
- modele `tenantKey` unifie (`direct:` / `ms:` / `gws:`)
- persistance de ce modele dans les configs tenants et leur bridge core
- endpoints `GET /api/v1/tenants/{tenantKey}/{manifest|base.docx|brand}`
- verification JWT `RS256` + cache JWKS + controle `iss` / `tk`
- tests API de contrat sur ce read path

**Out of scope pour ce slice:**
- portail UI final `admin.cv-transpose.com`
- SSO Entra ID / Workspace complet de bout en bout
- allowlists utilisateurs/groupes
- audit log read-model
- wrappers Copilot / Gemini eux-memes

**References:**
- `spec/SPEC_EVOL_MULTI_MARKETPLACE.md`
- `spec/SPEC_EVOL_MULTI_MARKETPLACE_INTERFACES.md` (Contrat 3)
- `PLAN.md`

---

## Task 1 — Introduire le modele `tenantKey`

**Files:**
- Modify: `api/src/services/tenant-config.ts`
- Modify: `api/src/services/tenant-admin.ts`
- Modify: `api/src/services/admin-auth.ts`
- Modify: `api/src/services/tenant-template-assets.ts`
- Modify: tenant configs seedes sous `api/templates/tenants/*/config.json`
- Add tests in `api/src/services/*.test.ts`

- [ ] Ajouter un `tenantKey` canonique dans la config tenant
- [ ] Ajouter le metadata minimal d'identite marketplace (type `direct|ms|gws`, valeur source)
- [ ] Conserver la compatibilite lecture des tenants existants sans `tenantKey`
- [ ] Faire emettre ce `tenantKey` par le bridge `TenantConfig -> TemplateAssets` au lieu du `direct:<slug>` hardcode
- [ ] Couvrir la migration soft en tests

## Task 2 — Exposer les assets read-only

**Files:**
- Add: `api/src/routes/tenant-assets.ts`
- Modify: `api/src/app.ts`
- Add: `api/src/services/tenant-assets-auth.ts`
- Add tests under `api/src/routes/` or `api/src/services/`

- [ ] Ajouter `GET /api/v1/tenants/:tenantKey/manifest`
- [ ] Ajouter `GET /api/v1/tenants/:tenantKey/base.docx`
- [ ] Ajouter `GET /api/v1/tenants/:tenantKey/brand`
- [ ] Retourner les `content-type` et `Cache-Control: private, max-age=300` conformes au Contrat 3
- [ ] Retourner `404` sans body pour tenant inconnu

## Task 3 — Verifier les JWT `RS256` / JWKS

**Files:**
- Add: `api/src/services/jwks-cache.ts`
- Add: `api/src/services/tenant-assets-auth.ts`
- Modify: `api/src/config/env.ts`
- Add tests dedicated auth/JWKS

- [ ] Supporter les issuers attendus:
  - [ ] `web-direct.cv-transpose.com`
  - [ ] `ms-copilot.cv-transpose.com`
  - [ ] `gemini-ent.cv-transpose.com`
- [ ] Verifier `Authorization: Bearer <jwt>`
- [ ] Verifier `iss`, `sub`, `tk`, `iat`, `exp`
- [ ] Refuser `tk` qui ne matche pas le path
- [ ] Emettre `401 {"error":"invalid_jwt","reason":"..."}` selon le contrat
- [ ] Mettre en cache les JWKS et refresh sur `kid` inconnu

## Task 4 — Fermer la boucle admin minimum

**Files:**
- Modify: `api/src/routes/admin.ts`
- Modify: `api/src/services/tenant-admin.ts`
- Optional later UI touch: `ui/src/lib/components/TenantBuilderForm.svelte`

- [ ] Faire ecrire le `tenantKey` dans la creation tenant existante pour le cas `direct:`
- [ ] Garder OTP/root-admin operationnels pour le web direct
- [ ] Ne pas tenter le vrai SSO marketplace dans ce slice
- [ ] Documenter explicitement la dette restante SSO Entra/Workspace

## Verification

- [ ] Tests API existants passent via Docker
- [ ] Nouveaux tests assets/JWT passent via Docker
- [ ] `make test-core-python` reste vert
- [ ] Aucun changement de comportement sur les routes web direct existantes

## Exit criteria

- [ ] Un tenant `direct:` peut servir `manifest`, `base.docx`, `brand` via `/api/v1/tenants/...`
- [ ] L'API refuse les JWT invalides et accepte un JWT `RS256` avec `tk` valide
- [ ] Le bridge d'assets ne hardcode plus `direct:<slug>`
- [ ] Le slice debloque l'ecriture des wrappers P1.4/P1.5 sans fallback generique
