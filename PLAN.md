# PLAN.md — Roadmap active marketplaces

Plan actif du repo. Il remplace le vieux checklist historique centré
multi-tenant/UAT/template runtime. Ce qui est déjà en prod n'est plus dans le
chemin critique de ce plan.

## Cadre

- Prod de reference: `release-v0.2.2`
- `master` sert a integrer le travail courant, sans deploiement prod direct
- Prod ne bouge que via tag `release-v*`
- Scalian est considere stable pour cette phase
- Le realignement renderer generique / sortie de `scalian-xml` est reporte
  apres les marketplaces

## References de cadrage

- Vision: `spec/SPEC_EVOL_MULTI_MARKETPLACE.md`
- Interfaces partagees: `spec/SPEC_EVOL_MULTI_MARKETPLACE_INTERFACES.md`
- Extension `transpose()` deja livree: `spec/SPEC_EVOL_TRANSPOSE_EXTENSIONS.md`
- Execution precedente: `plans/PLAN_P1.5_BIS_TRANSPOSE_EXTENSIONS.md`

## Deja derriere nous

- [x] Shell web direct multi-tenant en prod
- [x] `core-v0.2.0` et pipeline `transpose()` integre cote API
- [x] `release-v0.2.2` deployee en prod
- [x] Gating CI/CD: prod uniquement via tags de release
- [x] Scalian prod, redirect legacy et wording corriges

## P1.2 — Python core pour runtimes marketplace

Statut: **qualification fermee**

Constat repo:

- [x] package `core/python/cv_transpose_core/`
- [x] API publique Python `transpose(...)`
- [x] extraction PDF/DOCX pure Python
- [x] rendu DOCX / validation structurelle
- [x] tests Python unitaires + equivalence TS/Python sur fixture Scalian
- [x] target Docker `make test-core-python`
- [x] parite harness extraction JSON:
  - [x] `response_format="json"`
  - [x] budget par defaut `16k` / `32k` pour longs CV
  - [x] `max_tokens` configurable
  - [x] `max_parse_retries` configurable
  - [x] retry parse JSON avec prompt de rattrapage
  - [x] `TemplateAssets.renderer` accepte `generic|legacy-scalian`

Reste a fermer avant de considerer P1.2 comme bouclee:

- [x] aligner le plumbing `validate-page1` vs TS (`warnings`, `validation_passed`, retries, feedback prompt)
- [x] realigner le fail-soft sur `base_docx` illisible (per-file au lieu d'une exception top-level)
- [x] arbitrer le contrat `.doc` (`application/msword`) cote Python marketplace
- [x] etendre l'equivalence au-dela du golden Scalian unique (retries, callbacks, erreurs)
- [x] qualifier proprement la consommation du port Python par les wrappers marketplace
- [x] figer ce qui est explicitement hors scope P1.2 pour eviter les glissements
  - detector page-1 concret en Python reste un no-op pur; une heuristique sandbox-safe ne sera ajoutee que si un besoin marketplace reel l'impose

## P1.3 — Backoffice marketplace + assets API

Statut: **minimum unblocker en place**

Fondations deja presentes dans le repo:

- [x] claim d'espace par URL societe + email corporate + OTP
- [x] mode root-admin mot de passe
- [x] stockage tenant S3 / filesystem
- [x] creation tenant + analyse template + scraping brand
- [x] bridge `TenantConfig -> TemplateAssets`

Deja en place pour le minimum unblocker:

- [x] API read-only d'assets pour agents marketplace
- [x] auth JWT RS256 pour cette API
- [x] mapping explicite des claims identite -> `tenantKey` (`direct:` present, socle `ms:` / `gws:` pose)

Manques critiques pour la phase marketplace:

- [ ] portail backoffice dedie `admin.cv-transpose.com`
- [ ] SSO Entra ID
- [ ] SSO Google Workspace
- [ ] workflow d'upload/publication adapte au backoffice marketplace

## P1.4 — Agent Microsoft 365 Copilot

Statut: **en cours**

Fondations deja presentes dans le repo:

- [x] package Python partage `cv_transpose_marketplace` (claims -> `tenantKey`, fetch assets)
- [x] wrapper `run_copilot_transpose(...)` pur Python au-dessus de `cv_transpose_core.transpose()`
- [x] packaging in-memory DOCX / ZIP + card JSON minimale
- [x] execution `persistence="ephemeral"` cote wrapper
- [x] resolution du tenant via identite Entra ID (`ms:<tid>`)
- [x] retour DOCX / ZIP + rapport d'alignement via runtime HTTP local
- [x] fallback explicite `tenant_not_configured` / `assets_auth_failed` / `assets_unavailable`
- [x] cache court in-process des assets template cote runtime (TTL configurable, 300 s par defaut)
- [x] bundle deterministe local du runtime Copilot

- [ ] agent declaratif Copilot Studio
- [ ] action `transposeCvs` branchant le core Python
- [ ] packaging / attestation AppSource / Partner Center
- [ ] smoke post-publication

## P1.5 — Agent Gemini Enterprise

Statut: **en cours**

Fondations deja presentes dans le repo:

- [x] runtime Python partage pour artefact DOCX / ZIP
- [x] wrapper `run_gemini_transpose(...)` pur Python au-dessus de `cv_transpose_core.transpose()`
- [x] resolution `gws:<domain>` via claims Workspace
- [x] execution `persistence="ephemeral"` cote wrapper
- [x] runtime HTTP local + JWKS pour l'adapter Gemini
- [x] fallback explicite `tenant_not_configured` / `assets_auth_failed` / `assets_unavailable`
- [x] cache court in-process des assets template cote runtime (TTL configurable, 300 s par defaut)
- [x] bundle deterministe local Gemini ADK
- [x] surface de tool JSON-friendly pour l'agent ADK local
- [x] surface LLM-facing du tool `transpose_cvs` (function declaration +
      factory `make_transpose_cvs_tool` pour Agent(tools=[]))
- [x] validation explicite du payload runtime au bord (MarketplaceInputError)
- [x] validation forte du claim `hd` Workspace (forme DNS)

- [ ] agent Python ADK
- [ ] integration Vertex AI Agent Builder / Agentspace
- [ ] packaging / publication partner basique Google
- [ ] smoke post-publication

## Ordre d'execution courant

1. Fermer la qualification P1.2
2. Construire le minimum viable P1.3 pour alimenter les agents
3. Implementer P1.4 Copilot sur ce socle
4. Implementer P1.5 Gemini sur le meme socle

## Hors plan courant

- realignement renderer generique sans `scalian-xml`
- nouvelle passe UAT web/Scalian
- certification Phase 2 (M365 Certification, Gemini Enterprise Partner)
- billing / transactable marketplace

## Regle de conduite

- Toute evolution potentiellement cassante pour la prod doit etre proposee
  explicitement avant execution
- Quand le plan est cadre, on ne sort pas du plan
