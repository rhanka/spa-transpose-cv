# PLAN.md — Scalian CV Transpose SPA

> Dernière mise à jour : 2026-03-23

## Phases

### Phase 0 — Scaffolding projet ✅
- [x] SPEC_VOL.md (spec brute)
- [x] SPEC.md (spec raffinée)
- [x] PLAN.md (ce fichier)

### Phase 1 — Monorepo & infra de base ✅
- [x] Structure monorepo `api/` + `ui/` (inspiré top-ai-ideas-fullstack)
- [x] `api/package.json` — Hono, @anthropic-ai/sdk, jszip, zod, pino
- [x] `api/tsconfig.json` + build esbuild
- [x] `api/src/index.ts` — serveur Hono minimal + health check
- [x] `api/Dockerfile` — multi-stage (dev/build/prod)
- [x] `ui/package.json` — SvelteKit 2 + Svelte 5, Tailwind, adapter-static
- [x] `ui/svelte.config.js` + `ui/vite.config.ts`
- [x] `ui/Dockerfile` — multi-stage (dev/build/prod avec Nginx)
- [x] `docker-compose.yml` + `docker-compose.dev.yml`
- [x] `Makefile` — targets: dev, build, publish, deploy
- [x] `.env.example` — template des variables
- [x] `.gitignore` + `.dockerignore`
- [x] Commit atomique

### Phase 2 — API core (sessions + chiffrement) ✅
- [x] `api/src/config/env.ts` — validation env (Zod)
- [x] `api/src/services/crypto.ts` — PBKDF2 + AES-256-GCM (derive, encrypt, decrypt)
- [x] `api/src/services/session-manager.ts` — CRUD sessions filesystem
- [x] `api/src/services/purge.ts` — sweep sessions expirées
- [x] `api/src/middleware/rate-limit.ts`
- [x] `api/src/middleware/security-headers.ts`
- [x] `api/src/routes/sessions.ts` — POST create, POST upload, GET status, GET results, GET download
- [x] `api/src/routes/health.ts`
- [x] Commit atomique

### Phase 3 — Port TypeScript du toolkit Scalian ✅
- [x] `api/src/services/scalian-xml.ts` — port complet des builders XML
- [x] `api/src/services/docx-tools.ts` — unpack/pack/validate DOCX
- [x] `api/src/services/text-extractor.ts` — wrapper pdftotext + pandoc
- [x] Template copié dans api/templates/
- [x] Commit atomique

### Phase 4 — Agent Claude orchestrator ✅
- [x] `api/src/services/cv-agent.ts` — prompt système + appel Claude Sonnet
- [x] `api/src/services/orchestrator.ts` — lance N agents en parallèle, SSE progress
- [x] Prompt système embarqué (extraction + mapping JSON structuré)
- [x] Concurrency pool (MAX_CONCURRENT_AGENTS)
- [x] Batch summary generation
- [x] Commit atomique

### Phase 5 — Frontend SPA Svelte 5 ✅
- [x] Design system Scalian : CSS custom properties + Tailwind tokens
- [x] Layout global : header Scalian (logo gradient), footer
- [x] Upload page : drag & drop, password, prompt, validation
- [x] Session page : password gate, SSE progress, download, share URL
- [x] `ui/src/lib/api.ts` — client API (fetch wrapper)
- [x] `ui/src/lib/stores/session.ts` — état session (Svelte stores)
- [x] Commit atomique

### Phase 6 — Intégration & tests ✅
- [x] Docker compose : API + UI fonctionnels ensemble
- [x] API health check OK (200)
- [x] Session create/results API OK
- [x] UI serving correctly (200)
- [x] Fix app.html (%sveltekit.head%)
- [x] Fix Docker dev workflow (svelte-kit sync)
- [x] Commit atomique

### Phase 7 — Déploiement ✅
- [x] Namespace SCW `transpose-cv` créé (ce42c9e9-da17-407a-a61d-4032e0e80e1d)
- [x] API container SCW créé (1d2a0965-...) — rollout via `make deploy`
- [x] Domain API : `scalian-cv-api.sent-tech.ca` (CNAME → SCW)
- [x] Domain UI : `scalian-cv.sent-tech.ca` (GitHub Pages)
- [x] CI/CD unifié : `.github/workflows/ci.yml`
  - Change detection (dorny/paths-filter)
  - Build API image + typecheck (parallel)
  - Build UI static + typecheck (parallel)
  - Publish API → SCW registry
  - Deploy API → SCW rollout
  - Deploy UI → GitHub Pages
- [x] Repo GitHub créé : `rhanka/spa-transpose-cv`
- [x] Commits atomiques tout le long

### Phase 8 — Polish & hardening
- [ ] Rate limiting affiné
- [ ] Validation taille fichiers (50 MB max)
- [ ] Messages d'erreur utilisateur clairs
- [ ] Téléchargement ZIP du lot complet
- [ ] DNS CNAME `scalian-cv-api.sent-tech.ca` → SCW container
- [ ] DNS CNAME `scalian-cv.sent-tech.ca` → GitHub Pages
- [ ] GitHub Pages settings (custom domain, HTTPS)
- [ ] Secrets GitHub : SCW_ACCESS_KEY, SCW_SECRET_KEY, SCW_PROJECT_ID, SCW_ORGANIZATION_ID, REGISTRY, ANTHROPIC_API_KEY

## Décisions techniques

| Décision | Choix | Raison |
|----------|-------|--------|
| Pas de DB | Filesystem /data/ | Simplicité, RGPD (purge = rm -rf) |
| Pas de S3 | Volume local | Pas de dépendance externe, chiffrement simple |
| AES-256-GCM | Node crypto natif | Pas de dépendance, standard |
| PBKDF2 | 100k itérations | Résistant au brute-force, natif Node |
| Hono | Ultra-léger | Parfait pour serverless, API similaire Express |
| adapter-static | SPA pure | Pas de SSR nécessaire, Nginx pour servir |
| Claude Sonnet | Extraction CV | Bon rapport coût/qualité |
| Monorepo | api/ + ui/ | Pattern validé sur top-ai-ideas-fullstack |

## Risques

| Risque | Mitigation |
|--------|------------|
| Volume éphémère SCW = perte données au redéploiement | Acceptable : données temporaires par design (48h) |
| Rate limit Anthropic | Max 5 agents concurrents, queue si > 5 |
| Fichiers volumineux en mémoire | Streaming chiffrement, limit 50 MB total |
| Mot de passe faible | Avertissement UI, pas de blocage (choix utilisateur) |
