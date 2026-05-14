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

Statut: **en qualification**

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

- [ ] traiter l'ecart page-1 validation vs TS (`warnings`, `validation_passed`, phase `validate-page1`)
- [ ] realigner le fail-soft sur `base_docx` illisible (per-file au lieu d'une exception top-level)
- [ ] arbitrer le contrat `.doc` (`application/msword`) cote Python marketplace
- [ ] etendre l'equivalence au-dela du golden Scalian unique (retries, callbacks, erreurs)
- [ ] qualifier proprement la consommation du port Python par les wrappers marketplace
- [ ] figer ce qui est explicitement hors scope P1.2 pour eviter les glissements

## P1.3 — Backoffice marketplace + assets API

Statut: **partiel**

Fondations deja presentes dans le repo:

- [x] claim d'espace par URL societe + email corporate + OTP
- [x] mode root-admin mot de passe
- [x] stockage tenant S3 / filesystem
- [x] creation tenant + analyse template + scraping brand
- [x] bridge `TenantConfig -> TemplateAssets`

Manques critiques pour la phase marketplace:

- [ ] portail backoffice dedie `admin.cv-transpose.com`
- [ ] SSO Entra ID
- [ ] SSO Google Workspace
- [ ] API read-only d'assets pour agents marketplace
- [ ] auth JWT RS256 pour cette API
- [ ] mapping explicite des claims identite -> `tenantKey` (`ms:` / `gws:`)
- [ ] workflow d'upload/publication adapte au backoffice marketplace

## P1.4 — Agent Microsoft 365 Copilot

Statut: **non demarre**

- [ ] agent declaratif Copilot Studio
- [ ] action `transposeCvs` branchant le core Python
- [ ] resolution du tenant via identite Entra ID
- [ ] retour DOCX / ZIP + carte de resultat
- [ ] packaging / attestation AppSource / Partner Center
- [ ] smoke post-publication

## P1.5 — Agent Gemini Enterprise

Statut: **non demarre**

- [ ] agent Python ADK
- [ ] integration Vertex AI Agent Builder / Agentspace
- [ ] resolution du tenant via identite Workspace
- [ ] retour DOCX / ZIP symetrique a Copilot
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
