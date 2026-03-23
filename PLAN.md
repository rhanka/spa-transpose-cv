# PLAN.md — Scalian CV Transpose SPA

> Dernière mise à jour : 2026-03-23

## Phases

### Phase 0 — Scaffolding projet ✅
- [x] SPEC_VOL.md (spec brute)
- [x] SPEC.md (spec raffinée)
- [x] PLAN.md (ce fichier)

### Phase 1 — Monorepo & infra de base
- [ ] Structure monorepo `api/` + `ui/` (inspiré top-ai-ideas-fullstack)
- [ ] `api/package.json` — Hono, @anthropic-ai/sdk, jszip, zod, pino
- [ ] `api/tsconfig.json` + build esbuild
- [ ] `api/src/index.ts` — serveur Hono minimal + health check
- [ ] `api/Dockerfile` — multi-stage (dev/build/prod)
- [ ] `ui/package.json` — SvelteKit 2 + Svelte 5, Tailwind, adapter-static
- [ ] `ui/svelte.config.js` + `ui/vite.config.ts`
- [ ] `ui/Dockerfile` — multi-stage (dev/build/prod avec Nginx)
- [ ] `docker-compose.yml` + `docker-compose.dev.yml`
- [ ] `Makefile` — targets: dev, build, publish, deploy
- [ ] `.env.example` — template des variables
- [ ] `.gitignore` + `.dockerignore`
- [ ] Commit atomique

### Phase 2 — API core (sessions + chiffrement)
- [ ] `api/src/config/env.ts` — validation env (Zod)
- [ ] `api/src/services/crypto.ts` — PBKDF2 + AES-256-GCM (derive, encrypt, decrypt)
- [ ] `api/src/services/session-manager.ts` — CRUD sessions filesystem
- [ ] `api/src/services/purge.ts` — sweep sessions expirées
- [ ] `api/src/middleware/rate-limit.ts`
- [ ] `api/src/middleware/security-headers.ts`
- [ ] `api/src/routes/sessions.ts` — POST create, POST upload, GET status, GET results, GET download
- [ ] `api/src/routes/health.ts`
- [ ] Tests unitaires crypto + session-manager
- [ ] Commit atomique

### Phase 3 — Port TypeScript du toolkit Scalian
- [ ] Déplacer `scalian_xml.py` → garder comme référence
- [ ] `api/src/services/scalian-xml.ts` — port complet des builders XML
- [ ] `api/src/services/docx-tools.ts` — unpack/pack/validate DOCX
- [ ] `api/src/services/text-extractor.ts` — wrapper pdftotext + pandoc
- [ ] Tests : round-trip template → build → pack → validate
- [ ] Commit atomique

### Phase 4 — Agent Claude orchestrator
- [ ] `api/src/services/cv-agent.ts` — prompt système + appel Claude pour 1 CV
- [ ] `api/src/services/orchestrator.ts` — lance N agents en parallèle, SSE progress
- [ ] `api/src/routes/sessions.ts` — POST /run + GET /status (SSE)
- [ ] Prompt système embarqué (extraction + mapping + génération JSON structuré)
- [ ] Gestion erreurs : retry 1x par CV, puis marqué failed
- [ ] Commit atomique

### Phase 5 — Frontend SPA Svelte 5
- [ ] Design system Scalian : CSS custom properties, composants de base
- [ ] `ui/src/lib/components/Header.svelte` — logo + nav Scalian
- [ ] `ui/src/lib/components/Button.svelte` — primary/secondary
- [ ] `ui/src/lib/components/FileDropzone.svelte` — drag & drop
- [ ] `ui/src/lib/components/PasswordInput.svelte`
- [ ] `ui/src/lib/components/ProgressTracker.svelte` — SSE listener
- [ ] `ui/src/lib/components/ResultsList.svelte` — download links
- [ ] `ui/src/lib/api.ts` — client API (fetch wrapper)
- [ ] `ui/src/lib/stores/session.ts` — état session (Svelte 5 runes)
- [ ] `ui/src/routes/+page.svelte` — écran upload
- [ ] `ui/src/routes/session/[id]/+page.svelte` — progression + résultats
- [ ] `ui/src/routes/+layout.svelte` — layout global
- [ ] `ui/src/app.css` — Tailwind + design tokens Scalian
- [ ] Responsive (mobile-first)
- [ ] Commit atomique

### Phase 6 — Intégration & tests E2E
- [ ] Docker compose : API + UI fonctionnels ensemble
- [ ] Test E2E : upload → run → download (avec mock Claude ou CV réel)
- [ ] Test : partage de lien + saisie mot de passe
- [ ] Test : purge 48h
- [ ] Fix bugs d'intégration
- [ ] Commit atomique

### Phase 7 — Déploiement Scaleway
- [ ] `.env` production (ANTHROPIC_API_KEY, etc.)
- [ ] `Makefile` targets : check-scw, create-namespace, publish, deploy
- [ ] Créer namespace Scaleway Container Registry
- [ ] Créer container serverless (API + UI bundled ou séparés)
- [ ] Premier déploiement
- [ ] Vérifier health check + smoke test
- [ ] Commit atomique

### Phase 8 — Polish & hardening
- [ ] Rate limiting affiné
- [ ] Validation taille fichiers (50 MB max)
- [ ] Messages d'erreur utilisateur clairs
- [ ] Indicateur d'expiration sur l'écran résultats
- [ ] Téléchargement ZIP du lot complet
- [ ] GitHub Actions CI/CD (build + deploy on push to main)
- [ ] Commit atomique

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
