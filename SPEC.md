# SPEC — Scalian CV Transpose SPA

> Version : 1.0 — 2026-03-23

## 1. Vision produit

Application web interne permettant à un recruteur Scalian de :
1. Uploader un lot de CVs (PDF, DOCX, DOC)
2. Fournir un **prompt d'orientation** (ex: "focus cloud/DevOps, anglais, consolider les postes >20 ans")
3. Lancer la conversion parallèle vers le format Scalian
4. Télécharger les CVs convertis + un rapport de synthèse

Le tout sans base de données, sans stockage objet externe, avec chiffrement côté serveur et purge automatique sous 48h (RGPD).

## 2. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Navigateur                          │
│  SPA Svelte 5 (SvelteKit static)                        │
│  ┌─────────┐  ┌──────────┐  ┌─────────────────────┐    │
│  │ Upload  │→ │ Progress │→ │ Download results    │    │
│  │ + mdp   │  │ (SSE)    │  │ + batch summary     │    │
│  └─────────┘  └──────────┘  └─────────────────────┘    │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS (REST + SSE)
┌──────────────────────▼──────────────────────────────────┐
│                  API Hono (TypeScript)                    │
│                                                          │
│  POST /api/sessions          → crée session + dérive clé │
│  POST /api/sessions/:id/upload → upload CVs chiffrés     │
│  POST /api/sessions/:id/run  → lance N agents Claude     │
│  GET  /api/sessions/:id/status → SSE progression         │
│  GET  /api/sessions/:id/results → liste résultats        │
│  GET  /api/sessions/:id/download/:file → fichier chiffré │
│  GET  /api/health            → liveness                  │
│                                                          │
│  ┌──────────────┐  ┌────────────────────────────────┐   │
│  │ Session Mgr  │  │ Agent orchestrator             │   │
│  │ (filesystem) │  │ N × Claude API en parallèle    │   │
│  │ /data/:sid/  │  │ scalian_xml + docx_tools (TS)  │   │
│  └──────────────┘  └────────────────────────────────┘   │
│                                                          │
│  Purge cron : supprime /data/:sid/ si > 48h             │
└─────────────────────────────────────────────────────────┘
```

## 3. Modèle de données (filesystem)

```
/data/
  {session-id}/
    meta.json          # { createdAt, prompt, status, files: [...] }
    inputs/
      cv1.pdf.enc      # AES-256-GCM chiffré
      cv2.docx.enc
    outputs/
      Scalian_Profile_Nom_EN.docx.enc
      batch_summary.md.enc
      batch_summary.docx.enc
    tmp/                # workspace éphémère (non chiffré, purgé dès fin de traitement)
```

### Chiffrement

- **Algorithme** : AES-256-GCM (Node.js `crypto`)
- **Dérivation** : PBKDF2 (SHA-512, 100 000 itérations, salt aléatoire par session)
- **Flux** :
  1. L'utilisateur fournit un mot de passe à l'upload
  2. Le serveur dérive une clé AES-256 via PBKDF2(password, session_salt)
  3. Chaque fichier est chiffré individuellement (IV unique par fichier)
  4. La clé dérivée est gardée en mémoire (Map session→key) pendant le traitement
  5. Pour le download, le client renvoie le mot de passe, le serveur re-dérive et déchiffre à la volée
  6. **Le mot de passe n'est jamais stocké** — seul le salt est persisté dans meta.json

### Partage de session

- URL : `https://app.example.com/session/{session-id}`
- Le destinataire doit connaître le mot de passe pour déchiffrer les résultats
- Pas de cookie/JWT — l'identifiant de session est dans l'URL, le mot de passe est saisi à chaque action

## 4. Cycle de vie d'une session

```
[1] CREATED     → POST /api/sessions { password }
[2] UPLOADING   → POST /api/sessions/:id/upload (multipart, password en header)
[3] READY       → tous les fichiers uploadés
[4] PROCESSING  → POST /api/sessions/:id/run { prompt }
    ├─ Agent 1 → CV 1 → progress 1/N
    ├─ Agent 2 → CV 2 → progress 2/N
    └─ Agent N → CV N → progress N/N
[5] DONE        → tous les agents terminés, résultats chiffrés
[6] EXPIRED     → purge après 48h (cron)
```

## 5. Agent Claude — orchestration

Chaque CV est traité par un appel Claude API indépendant :

```typescript
// Pseudo-code
const results = await Promise.allSettled(
  files.map(file => processCV(file, prompt, sessionKey))
);
```

`processCV` :
1. Déchiffre le fichier source
2. Extrait le texte (pdftotext / pandoc)
3. Appelle Claude API avec le prompt système (règles CLAUDE.md) + le texte du CV + le prompt utilisateur
4. Claude retourne un JSON structuré avec les données du CV mappées
5. Le script génère le DOCX via `scalian-xml.ts` + `docx-tools.ts`
6. Chiffre le résultat et le stocke

**Modèle** : `claude-sonnet-4-6` (rapport coût/qualité optimal pour l'extraction)
**Concurrence** : limité à 5 agents simultanés (rate limit Anthropic)

## 6. Frontend — écrans

### 6.1 Écran d'accueil / Upload

- Header Scalian (logo, fond `#1D1148`)
- Zone de drop / sélection de fichiers (PDF, DOCX, DOC)
- Champ mot de passe de chiffrement (obligatoire)
- Champ prompt d'orientation (textarea, optionnel)
- Bouton "Lancer la conversion" (`#60BB9B`)

### 6.2 Écran de progression

- URL partageable : `/session/{id}`
- Barre de progression globale
- Liste des CVs avec statut individuel (pending / processing / done / error)
- Logs en temps réel (SSE)

### 6.3 Écran de résultats

- Saisie du mot de passe (si pas en mémoire côté client)
- Liste des fichiers convertis avec téléchargement individuel
- Téléchargement ZIP de tout le lot
- Rapport de synthèse (batch_summary) affiché inline
- Indicateur d'expiration ("Ces fichiers seront supprimés le JJ/MM à HH:MM")

## 7. Design system — Scalian

```css
:root {
  --color-purple-dark: #1D1148;
  --color-purple: #4B2882;
  --color-purple-light: #635A84;
  --color-purple-border: #E9E4F8;
  --color-purple-bg: #F2F3FE;
  --color-green: #60BB9B;
  --color-green-hover: #6DD4AF;
  --color-white: #FFFFFF;
  --color-gradient-start: #E4005B;
  --color-gradient-end: #61BA9A;

  --font-display: 'Poppins', system-ui, sans-serif;
  --font-body: 'Inter', system-ui, sans-serif;

  --shadow-card: 0 20px 40px 0 rgba(29, 17, 72, 0.1);
  --ease-smooth: cubic-bezier(0.215, 0.61, 0.355, 1);
}
```

- Boutons **rectangulaires** (pas de border-radius)
- Bouton primaire : fond `#60BB9B`, texte blanc, border 2px
- Bouton secondaire : transparent, border `#4B2882` 50% opacity
- Typographie : Poppins pour titres, Inter pour corps

## 8. Stack technique

| Couche | Technologie |
|--------|-------------|
| Frontend | SvelteKit 2 + Svelte 5, adapter-static, Tailwind CSS |
| Backend | Hono + @hono/node-server, TypeScript |
| Build | Vite (UI), esbuild (API) |
| CV processing | scalian-xml.ts, docx-tools.ts (port existant) |
| Extraction texte | pdftotext (poppler-utils), pandoc |
| LLM | @anthropic-ai/sdk (Claude claude-sonnet-4-6) |
| Chiffrement | Node.js crypto (AES-256-GCM + PBKDF2) |
| Containerisation | Docker multi-stage |
| Déploiement | Scaleway Serverless Container |
| CI/CD | GitHub Actions |

## 9. Sécurité & RGPD

- **Pas de DB** : aucune donnée structurée persistante
- **Pas de S3** : tout sur le filesystem du container (volume éphémère ou tmpfs)
- **Chiffrement at-rest** : AES-256-GCM, clé dérivée du mot de passe utilisateur
- **Purge automatique** : cron toutes les heures, supprime les sessions > 48h
- **Pas de logs nominatifs** : les logs contiennent uniquement session-id + statut
- **HTTPS obligatoire** : terminaison TLS par Scaleway
- **Rate limiting** : sur upload et /run pour éviter les abus
- **Taille max** : 50 MB par session (tous fichiers confondus)

## 10. Déploiement Scaleway

- **Registry** : `rg.fr-par.scw.cloud/{namespace}`
- **Container** : Scaleway Serverless Container (512 MB RAM, 1 vCPU min)
- **Volume** : /data monté en tmpfs ou volume éphémère
- **Variables d'environnement** :
  - `ANTHROPIC_API_KEY` — clé Claude API
  - `SESSION_MAX_AGE_HOURS=48` — durée de vie des sessions
  - `MAX_CONCURRENT_AGENTS=5` — parallélisme Claude
  - `MAX_UPLOAD_SIZE_MB=50` — limite upload
  - `NODE_ENV=production`

## 11. Hors périmètre (v1)

- Authentification utilisateur (pas de login)
- Multi-langue (UI en français uniquement)
- Historique des conversions
- Personnalisation du template Scalian
- Gestion des erreurs Claude avec retry sophistiqué
