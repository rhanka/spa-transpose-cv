# SPEC_EVOL_MULTI_MARKETPLACE

> Distribution du service CV Transpose sur Microsoft 365 Copilot Agent Store
> et Gemini Enterprise Agentspace, en parallèle du shell web direct existant.

Date : 2026-04-25
Statut : design en cours de validation

## 1. Contexte

CV Transpose existe aujourd'hui en SaaS multi-tenant déployé sur Scaleway :

- API Hono TypeScript (`api/`), shell SvelteKit statique (`ui/`), packagés en
  Docker, déployés via Scaleway Serverless Container.
- Multi-tenant via slug d'URL (`cv.sent-tech.ca` pour `_default`,
  `scalian.sent-tech.ca` pour Scalian, etc.).
- Multi-LLM (Mistral, Anthropic, OpenAI, Gemini, Cohere) via une couche
  d'abstraction provider.
- Stateless avec rétention chiffrée 48 h (AES-256-GCM, dérivation PBKDF2)
  sur un volume éphémère.
- Tenant config persistée sur S3 SCW (`cv-transpose-config`).

Cette spec définit comment livrer le **même service** sur deux marketplaces
agentiques publics, sans perdre le shell web direct.

## 2. Intention stratégique

Publier en **agent natif productisé** sur :

- **Microsoft 365 Copilot Agent Store** (catalogue public AppSource, géré
  via Microsoft Partner Center). Un admin M365 ajoute notre agent au
  catalogue de son entreprise, ses utilisateurs l'invoquent depuis Copilot.
- **Gemini Enterprise Agentspace / Agent Gallery** (catalogue public Google).
  Un admin Workspace ajoute notre agent au catalogue de son entreprise,
  ses utilisateurs l'invoquent depuis Gemini.
- **Shell web direct** conservé (`cv.sent-tech.ca`, `scalian.sent-tech.ca`,
  futurs tenants directs) pour les acheteurs hors marketplace.

Contraintes structurantes décidées :

- L'**exécution** des agents marketplace tourne dans le runtime du
  marketplace (Microsoft / Google), **jamais chez nous**. Aucune compute
  d'extraction / rendu / validation hébergée par Sent Tech pour ces deux
  canaux.
- Notre infrastructure n'héberge que le **backoffice** (portail
  d'enregistrement template + API d'assets template en lecture seule).
- **Pas d'objectif de billing / margin** sur les deux marketplaces. Les
  agents sont publiés gratuitement. La conversion business (tenants
  enterprise payants) passe par le portail.
- Le **comportement** (prompts, étapes du workflow, règles d'alignement)
  doit être strictement le même sur les trois shells.

## 3. Architecture

### 3.1 Quatre briques

```
                  ┌────────────────────────────────────────┐
                  │   Backoffice (chez nous, SCW)          │
                  │   admin.cv-transpose.com               │
                  │   • Portail admin SSO Entra/Workspace  │
                  │   • API assets template (read-only)    │
                  │   • Tenant config store (S3 SCW)       │
                  └──────────┬─────────────────────────────┘
                             │ fetch template
                             │
            ┌────────────────┼────────────────┐
            │                │                │
   ┌────────┴───────┐ ┌──────┴────────┐ ┌─────┴────────────┐
   │ Shell web      │ │ Agent MS      │ │ Agent Gemini     │
   │ ─ Hono TS      │ │ Copilot Store │ │ Enterprise       │
   │                │ │ ─ Python sbx  │ │ ─ ADK Python     │
   │ ┌────────────┐ │ │ ┌───────────┐ │ │ ┌──────────────┐ │
   │ │ Cœur TS    │ │ │ │ Cœur Py   │ │ │ │ Cœur Py      │ │
   │ │ (port TS)  │ │ │ │ (vendor-é)│ │ │ │ (vendor-é)   │ │
   │ └────────────┘ │ │ └───────────┘ │ │ └──────────────┘ │
   │     ▲          │ │     ▲         │ │     ▲            │
   └─────│──────────┘ └─────│─────────┘ └─────│────────────┘
         │                  │                 │
         └──────────────────┴─────────────────┘
                            │
              ┌─────────────┴───────────────┐
              │  Manifeste cœur partagé     │
              │  (repo versionné semver)    │
              │  • prompts/*.md             │
              │  • workflow.yaml            │
              │  • validation-rules.json    │
              │  • template-schema.json     │
              │  • fixtures + golden outputs│
              └─────────────────────────────┘
```

### 3.2 Cœur partagé — pourquoi double port

Les sandbox d'exécution in-runtime de Copilot Studio (code interpreter) et
Gemini Enterprise (Vertex AI Agent Builder / ADK) sont **Python uniquement**.
Pour respecter la contrainte "rien chez nous pendant l'exécution agent", le
cœur doit être exécutable dans ces sandbox, donc Python.

Le shell web tourne en TypeScript (Hono) et rend déjà bien. Le réécrire en
Python serait du churn pour aucun gain produit.

Solution retenue : **manifeste partagé + double port**, vivant dans un
dossier `core/` au top-level du monorepo `spa-transpose-cv` (pas de repo
dédié en phase MVP).

- Un **manifeste de comportement** versionné via tags Git du monorepo, à
  `core/` :
  - `core/spec/prompts/*.md` (prompts texte ; consommés mot-pour-mot par
    les trois shells)
  - `core/spec/workflow.yaml` (étapes du pipeline : extract → map →
    render → validate, avec leurs paramètres et leurs gates)
  - `core/spec/validation-rules.json` (règles d'alignement page 1,
    sections, typographie)
  - `core/spec/template-manifest-v1.json` (schéma JSON du manifeste de
    template entreprise)
  - `core/fixtures/*.{pdf,docx}` + `core/golden/*.docx` (CVs canoniques +
    sorties attendues, pour les tests d'équivalence)
- Deux **portages exécutifs** qui consomment ce manifeste :
  - `core/python/cv_transpose_core/` (pure Python : `zipfile`, `lxml`,
    `python-docx`, fontes vendored), zippé au build des agents
    marketplace.
  - `core/typescript/` (réutilise `jszip`, `xmldom`, l'orchestrateur
    existant), importé par le shell web via npm workspace local.

Tests d'équivalence obligatoires sur chaque release du manifeste, voir §6.

## 4. Composants

### 4.1 Backoffice (chez nous)

- **Hôte** : `admin.cv-transpose.com` (sous-domaine à acquérir, déployé sur
  SCW).
- **Auth** :
  - SSO **Entra ID** (OIDC, app registration côté Microsoft, scopes
    `openid email profile`) — utilisé quand un admin M365 vient configurer
    le tenant après installation de l'agent Copilot.
  - SSO **Workspace OAuth** (Google Identity, OIDC) — utilisé quand un
    admin Workspace vient configurer le tenant après installation de
    l'agent Gemini.
  - **Email + OTP** (réutilise le flow existant) — fallback pour acheteurs
    directs sans SSO marketplace.
- **Surfaces** :
  - Portail admin (Svelte, étend l'admin actuel) :
    - upload template DOCX (analysé par `template-analysis-agent`
      existant → manifeste de template),
    - palette de marque (couleurs primaire/secondaire/accent, fontes),
    - liste utilisateurs autorisés (par défaut : tous les users de l'org
      identifiée par le SSO ; option : restreindre par email/groupe),
    - audit log lecture seule (qui a appelé l'agent, quand, sur combien de
      CVs ; pas de contenu CV stocké).
  - **API assets template** (read-only, authentifiée par **JWT signé
    court-vivant** émis par le runtime de l'agent à partir du token
    d'identité de l'utilisateur final, contenant la clé tenant et un TTL
    de 5 minutes ; la signature est validée par le backoffice via une
    clé partagée par tenant ou un JWKS si plusieurs runtimes émettent) :
    - `GET /api/v1/tenants/{key}/manifest` → JSON manifeste de template.
    - `GET /api/v1/tenants/{key}/base.docx` → DOCX de base.
    - `GET /api/v1/tenants/{key}/brand` → tokens de marque.
- **Tenant config store** : S3 SCW, structure réutilise `tenants/{key}/`
  existant.
- **Clé tenant unifiée** :
  - `direct:<slug>` (acheteur direct, slug choisi à l'inscription).
  - `ms:<entra_tenant_uuid>` (extrait du token Entra de l'admin lors de la
    config initiale, puis du token de l'utilisateur final lors des appels
    agent).
  - `gws:<workspace_primary_domain>` (extrait du token Workspace, idem).

### 4.2 Shell web direct (existant, périmètre adapté)

- Hôte actuel inchangé (SCW Serverless Container + GitHub Pages pour l'UI).
- Continue à servir les acheteurs directs.
- UX riche conservée : galerie de templates, dropzone, batch, previews
  rendus, partage de session 48 h.
- Importe le package local `core/typescript/` (alias npm
  `@cv-transpose/core`) en remplacement progressif de la logique
  aujourd'hui dans `api/src/services/`.
- Persistance session 48 h chiffrée AES-256-GCM conservée.

### 4.3 Agent MS Copilot

- **Type** : agent declarative + actions Copilot Studio.
- **Hébergement** : 100 % runtime Microsoft 365 Copilot.
- **LLM** : GPT-4o (fourni par Copilot, payé par le tenant qui installe).
- **Surface UX** :
  - Chat avec attachement(s) de fichier (1 ou N CVs `.pdf` / `.docx`).
  - Réponse : DOCX rendu(s) en pièce jointe (1 fichier ou ZIP si batch) +
    adaptive card avec rapport d'alignement (sections détectées, warnings,
    score d'alignement).
  - Pas de mémoire conversationnelle, pas de chat libre.
- **Code** :
  - Manifeste declarative agent (`manifest.json` + instructions).
  - Une action Copilot Studio "transposeCvs" qui orchestre le pipeline.
  - Code interpreter Python qui embarque `cv_transpose_core` Python.
- **Distribution** : publication AppSource via Partner Center,
  attestation publisher en phase 1 (cf. §7).

### 4.4 Agent Gemini Enterprise

- **Type** : ADK Python agent (Vertex AI Agent Builder).
- **Hébergement** : 100 % runtime Google Gemini Enterprise.
- **LLM** : Gemini (fourni par Workspace / GCP, payé par le tenant qui
  installe).
- **Surface UX** : symétrique de l'agent MS (chat + attachement(s) →
  DOCX(s) + card de rapport).
- **Code** :
  - ADK agent definition (Python).
  - Tool d'exécution embarquant `cv_transpose_core` Python.
- **Distribution** : publication Agentspace / Agent Gallery via Google
  partner program, niveau basique en phase 1.

### 4.5 Cœur partagé (`core/` dans le monorepo)

- Vit dans le dossier `core/` du monorepo `spa-transpose-cv`, pas de repo
  dédié en phase MVP. Versioning via tags Git `core-v1.x.y`.
- Source de vérité du **comportement** (prompts, workflow, validation,
  schéma template, fixtures, golden).
- Structure :
  - `core/spec/` — manifeste partagé (prompts, workflow, validation, JSON
    Schema), source de vérité.
  - `core/python/cv_transpose_core/` — package Python pur (`zipfile`,
    `lxml`, `python-docx`), fontes Lato vendored, zippé au build des
    agents marketplace.
  - `core/typescript/` — package TypeScript (réutilise `jszip`, `xmldom`,
    `fast-xml-parser`), importé par le shell web via npm workspace local
    (chemin relatif).
  - `core/fixtures/` + `core/golden/` — CVs et sorties attendues.
  - `core/tests/equivalence/` — CI d'équivalence TS ↔ Python.
- Une extraction en repo dédié (`cv-transpose-core` open source) reste
  une option future si le cœur trouve des consommateurs externes ; non
  programmée en phase 1.

## 5. Data flow

### 5.1 Trajet d'un appel marketplace (MS Copilot, exemple)

1. L'utilisateur dans Copilot écrit `"transpose ce CV"` (ou variantes
   reconnues par les triggers de l'agent) et joint un ou plusieurs fichiers.
2. Copilot identifie l'agent et invoque l'action `transposeCvs` avec :
   - le ou les fichiers (URLs Microsoft Graph ou base64 inliné selon la
     taille),
   - le token d'identité de l'utilisateur (Entra ID, claims `tid` (tenant
     UUID), `upn`, `oid`).
3. L'action :
   1. Extrait `ms:<tid>` de la claim → clé tenant.
   2. Fetch backoffice : `GET /api/v1/tenants/ms:<tid>/manifest` +
      `/base.docx` + `/brand`. Si 404, message clair *"Votre entreprise
      n'a pas encore configuré de template, contactez votre admin"* +
      lien vers `admin.cv-transpose.com`.
   3. Pour chaque CV : extraction LLM (prompt du manifeste, GPT-4o de
      Copilot) → JSON structuré → render Python in-sandbox via
      `cv_transpose_core` → DOCX en mémoire → validation alignement.
   4. Réponse : pièce jointe DOCX (ou ZIP en batch) + adaptive card avec
      rapport.
4. Aucun contenu CV ni DOCX n'est écrit hors du runtime Copilot. Aucun
   appel sortant vers Sent Tech autre que les GET sur les assets template.

### 5.2 Trajet d'un appel Gemini Enterprise

Symétrique. La claim utilisée est le domaine Workspace primary
(`gws:<domain>`). Le LLM est Gemini, le runtime est Vertex AI Agent
Builder, le reste est identique.

### 5.3 Trajet d'un appel web direct (inchangé)

Comme aujourd'hui : URL → slug → tenant `direct:<slug>` → API Hono →
extraction LLM (Mistral par défaut, configurable) → render TS → DOCX
chiffré 48 h.

### 5.4 Onboarding d'un nouveau tenant marketplace

1. Un admin enterprise installe l'agent depuis AppSource ou Agentspace.
2. La fiche AppSource / Agentspace contient un lien
   `https://admin.cv-transpose.com/onboard?source=ms` (ou `=gws`).
3. L'admin clique, est redirigé vers SSO Entra ID / Workspace.
4. Le portail crée le tenant avec la clé extraite de la claim, ouvre
   l'écran d'upload de template, palette, users.
5. Au premier appel agent depuis cette org, le tenant est trouvé. Sinon
   message clair §5.1.3.b.

### 5.5 Persistance — divergence assumée par shell

| Shell | Persistance | Justification |
|---|---|---|
| Web direct | Session chiffrée AES-256-GCM 48 h sur volume SCW (existant) | Permet partage de lien, reprise, batch async |
| Marketplace (MS + Gemini) | **Strictement éphémère**, RAM uniquement | Conformité M365 Cert + Gemini Enterprise Partner ; pas de log avec contenu CV |

Le cœur Python prend en paramètre un flag `persistence: "session" \|
"ephemeral"` ; en mode `ephemeral` toute écriture disque est interdite et
les buffers sont zeroïsés en sortie.

### 5.6 Résidence physique

- Phase 1 : backoffice et shell web sur SCW FR-PAR. La donnée transite
  donc par la France pour les fetch d'assets template (faible volume) et
  pour le shell web (sessions complètes).
- Privacy notice claire dans la fiche AppSource / Agentspace : "Aucun CV
  n'est transmis à Sent Tech pendant l'exécution de l'agent. Seuls les
  assets de template d'entreprise sont récupérés depuis SCW FR-PAR."
- Phase 2 : multi-région du backoffice (UE, US) avec routing par claim de
  région du tenant. Hors périmètre initial.

## 6. Tests et équivalence entre les trois ports

C'est le seul garde-fou pour garantir "même prompts, même comportement"
entre TS et Python.

### 6.1 Niveaux

| Niveau | Quoi | Où |
|---|---|---|
| Fixtures partagées | ~30 CVs canoniques (junior, senior, multi-langues, edge cases : noms longs, dates ambiguës, lacunes, multi-pages) avec leurs golden DOCX outputs | `core/fixtures/` + `core/golden/` |
| Tests unitaires par port | Chaque fonction (extract, map, render, validate) testée séparément en TS et Python | Pipelines CI respectives |
| Tests d'équivalence | Sur chaque release du cœur : rejouer les fixtures sur les trois ports, diff DOCX (structure OOXML stricte + rendu PNG via LibreOffice). Tolérance définie : 0 sur la structure, RMSE < 0,15 sur le pixel | CI commune au repo cœur |
| Evals prompts | LLM-judge sur fixtures réelles : extraction GPT-4o vs Gemini vs LLM web. Métrique : recall des champs critiques (nom, expériences, dates, intitulés). Catch les divergences entre LLMs marketplace | CI commune |
| Smoke marketplace | Après chaque publish AppSource / Agentspace, smoke depuis un compte test (1 CV, vérifier DOCX retourné conforme) | Runbook ops |

### 6.2 Politique de release du cœur

- Bump semver à chaque modification fonctionnelle du manifeste.
- Tests d'équivalence verts obligatoires avant tag.
- Les trois shells consomment une version pinned du cœur, mise à jour de
  manière coordonnée.
- Rollback : un shell peut épingler une version antérieure si la nouvelle
  introduit une régression spécifique à son runtime.

## 7. Distribution et certification

### 7.1 Modèle commercial

- Agents publiés **gratuits** sur les deux marketplaces.
- Pas d'objectif de billing / margin sur ces canaux.
- La fiche redirige les acheteurs intéressés par des fonctions avancées
  (batch dépassant N, stockage long, intégrations sur-mesure) vers le
  portail `cv-transpose.com` pour conversion en compte direct.

### 7.2 Phasage de la certification

| Phase | MS | Google | Visibilité |
|---|---|---|---|
| Phase 1 (MVP) | Publisher Attestation (self-declared via Partner Center) | Workspace partner basic | Listing public, pas de badge "vérifié" |
| Phase 2 (V1) | Microsoft 365 Certification (audit sécu/privacy, ~3-6 mois, payant) | Gemini Enterprise Partner program | Badge "vérifié", search ranking, passe les filtres procurement enterprise |

## 8. Phasage de livraison

> Le plan d'exécution qui suivra cette spec **couvre uniquement la
> Phase 1**. Les phases 2 et 3 feront l'objet de specs / plans dédiés
> quand elles seront déclenchées.

### Phase 1 — MVP marketplace (~3-4 mois)

- Extraction du cœur depuis l'API monolithe actuelle vers le dossier
  `core/` du monorepo, avec port TS d'abord.
- Premier port Python (purement Python, pas de LibreOffice in-sandbox).
- Manifeste partagé : prompts versionnés, workflow YAML, validation rules,
  schéma template, fixtures de base.
- Tests d'équivalence TS ↔ Python sur les fixtures.
- Backoffice : portail SSO Entra ID + Workspace + OTP, upload template,
  API assets read-only.
- Agent MS Copilot publié via attestation, support 1 et N CVs, retour
  DOCX/ZIP + adaptive card.
- Agent Gemini Enterprise publié via partner basique, symétrique.
- Cible : 3 à 5 entreprises pilotes installant et utilisant les agents.

### Phase 2 — V1 enterprise-grade (~4-6 mois après MVP)

- Microsoft 365 Certification.
- Gemini Enterprise Partner program.
- Backoffice multi-région (UE / US), routing par claim région.
- Optionnel : transactable billing si la demande le justifie.

### Phase 3 — Extensions (opportuniste)

- Skills additionnels (résumer un CV, comparer deux CVs, extraire
  compétences).
- Intégrations natives Drive / SharePoint / OneDrive (auto-pickup,
  upload-back automatique).
- Customer-bring-your-own-key LLM.

## 9. Erreurs et fallbacks

| Échec | Comportement attendu |
|---|---|
| Backoffice indispo (fetch template / manifest échoue) | L'agent répond explicitement *"Configuration entreprise non joignable, réessayez plus tard"*, log côté agent, pas de fallback silencieux vers un template générique |
| Tenant pas encore configuré dans le backoffice (404) | L'agent répond *"Votre entreprise n'a pas encore configuré de template. Contactez votre admin."* + lien vers `admin.cv-transpose.com` |
| LLM marketplace down ou rate-limited | Erreur native du runtime ; l'agent renvoie un message générique. Pas de retry chez nous (ce n'est pas notre LLM) |
| Render DOCX échoue (CV trop atypique, OOXML cassé) | Le cœur Python catch et retourne une erreur structurée à l'agent, qui répond *"Échec du rendu sur ce CV : <raison>"*. En batch, on continue avec les autres et on remonte le bilan dans le ZIP |
| Incohérence sandbox (lib manquante, fichier inattendu) | **Fail-loud** systématique, jamais de swallow d'erreur ; consigne héritée du fix saturation LibreOffice |

## 10. Décisions techniques

| Décision | Choix | Raison |
|---|---|---|
| Cœur dual-port | Python (marketplace) + TypeScript (web) | Sandbox in-runtime des deux marketplaces est Python ; web shell existant en TS, pas de raison de le réécrire |
| Manifeste partagé | YAML + JSON + Markdown dans un repo semver | Source de vérité unique du comportement, deux exécuteurs |
| Persistance marketplace | Éphémère stricte | Conformité certif M365 + Gemini Enterprise |
| Identité | Claims marketplace mappées sur clé tenant unifiée | Un seul tenant store pour les trois surfaces |
| Billing | Gratuit avec redirect vers portail | Pas d'objectif margin sur marketplace |
| Compute agent | 100 % dans runtime marketplace | Contrainte explicite (résidence donnée, pas d'infra chez nous) |
| Surface agent | Une seule action (transpose 1 ou N CVs), pas de mémoire | Simplicité, certification rapide, comportement reproductible |
| Backoffice | SSO Entra + Workspace + OTP fallback | Couvre les trois canaux d'identité avec un seul portail |

## 11. Risques

| Risque | Mitigation |
|---|---|
| Divergence entre ports Python et TS au fil des releases | Tests d'équivalence obligatoires sur chaque release du cœur, gate de CI |
| LLM différents par shell (GPT-4o vs Gemini vs Mistral) → outputs sémantiquement différents | Evals prompts avec seuils de tolérance, fixtures larges, calibration par LLM si nécessaire |
| Sandbox Python des marketplaces limité (pas de LibreOffice, pas de fontes système, pas de packages C-deps) | Cœur en pure Python (`zipfile` + `lxml` + `python-docx`) ; fontes Lato vendored dans le package |
| Backoffice indispo bloque les agents | Cache court côté agent (~5 min sur le manifeste de template) + dégradation contrôlée avec message explicite |
| Refus de certification marketplace | Phase 1 utilise attestation seule ; phase 2 budget la vraie certif après PMF marketplace |
| Coût de double maintenance (Python + TS) | Manifeste partagé minimise la duplication ; bandeaux de tests d'équivalence forcent l'iso |
| Évolution rapide des SDK marketplace (Copilot Studio, ADK) en early-mid 2026 | Versionner l'agent, accepter un coût de portage ponctuel, isoler dans des couches d'adaptation |

## 12. Hors-scope

Pour cette spec :

- Transactable billing marketplace (V1+).
- Multi-région du backoffice (V2+).
- Skills additionnels (résumer / comparer / extraire), intégrations Drive
  / SharePoint / OneDrive natives.
- Customer-bring-your-own-key LLM côté agents marketplace.
- Réécriture du shell web en Python.

## 13. Dépendances et travaux préalables

- La bascule du moteur de template vers un runtime déclaratif
  (`spec/SPEC_EVOL_TEMPLATE_MANIFEST.md`, en cours d'écriture sur la
  branche `wip/saturation-and-celestial`) **doit aboutir avant** ce
  chantier : le manifeste de template est consommé tel quel par le cœur
  partagé. Sans lui, on porterait du code non-stabilisé.
- Le fix saturation LibreOffice (PR `wip/saturation-and-celestial`) est
  indépendant ; il peut être mergé en parallèle.
