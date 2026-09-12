# Enrôlement de comptes Codex & Cloud-Code — bascule luna / Gemini sans clé API mesurée

- **Statut**: proposition (design), non implémenté
- **Date**: 2026-09-11
- **Périmètre**: `spa-transpose-cv` (api) + `@sentropic/llm-mesh` ≥ 0.19
- **Décision demandée**: valider le mécanisme et le découpage avant implémentation

## 1. Motivation

L'extraction de CV passe désormais par la façade `@sentropic/llm-mesh`
(`LLM_MESH=true`, cf. `api/src/services/llm/mesh-adapter.ts`). Chaque provider
est aujourd'hui adossé à **une clé API mesurée** lue dans l'environnement
(`GEMINI_API_KEY`, `OPENAI_API_KEY`, …).

Le mur constaté en test le 2026-09-11 : la clé Gemini AI Studio **free-tier** est
plafonnée à **20 requêtes/jour** pour `gemini-3.8-flash`
(`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, `quotaValue: 20`). Un CV =
≥ 1 requête (plus le retry). Gemini est donc **inutilisable en prod** en l'état.
Le même raisonnement vaut pour OpenAI : la clé API mesurée facture au token,
alors qu'un abonnement ChatGPT/Codex donne accès à `gpt-5.6-luna` via son propre
quota déjà payé.

**Idée** : au lieu de clés API mesurées, **enrôler des comptes d'abonnement**
(Google pour Gemini via *Cloud-Code*, ChatGPT pour luna via *Codex*) par OAuth,
et laisser le mesh **router les requêtes sur un pool de comptes enrôlés** avec
rotation + cooldown. On bascule alors sur luna « en prime » sans coût au token,
et Gemini cesse d'être bridé par le free-tier.

## 2. Ce que fournit déjà llm-mesh 0.19

Deux surfaces publiques (vérifiées dans le paquet installé) :

### a) Enrôlement — `@sentropic/llm-mesh/enrollment`
- `EnrollmentProvider` : `start()`, `complete()`, `resolve()`, `refresh()`,
  et optionnels `waitForCallback()` / `pollForCompletion()` / `cancel()`.
- Providers : **`cloud-code`** (Google → Gemini), **`codex`** (ChatGPT → luna),
  `claude-code` (Anthropic, pour mémoire).
- `EnrollmentSession` renvoie soit un flux navigateur
  (`kind: 'authorization-url'`, OAuth + PKCE) soit un flux **device-code**
  (`verificationUrl` + `userCode` + `pollIntervalMs`) — idéal en CLI/headless.
- `PreparedCredential` : `{ accountId, accessToken, refreshToken?, expiresAt,
  authClientConfigVersion, accountEmail? }`.
- `resolve()` renvoie des métadonnées provider (ex. `cloudaicompanionProject`
  pour Cloud-Code/Gemini).
- Helper PKCE fourni (`enrollment/pkce.ts`).

### b) Pool de comptes — `account-transports` + `./transport/cloud-code`
- `AccountTransportAccount` : compte enrôlé stocké (`accessToken`,
  `refreshToken`, `expiresAt`, `targetProviderId`, `transportProviderId`,
  `status`, `priority`, `weight`, `cooldownUntil`, `modelIds`).
- `status` ∈ `active | cooldown | reauth_required | disabled`.
- Modèle **acquire → reservation → lease → outcome** : on acquiert un compte
  pour une requête (par `targetProviderId` + `modelId` + `affinityKey`), on
  exécute, puis on reporte l'`outcome` (`success | failed | rate_limited |
  auth_failed`). Un `rate_limited` met le compte en **cooldown** et la requête
  suivante bascule sur un autre compte du pool.

C'est précisément ce qui casse le mur des 20 req/jour : **N comptes enrôlés,
tournés automatiquement, mis en cooldown au rate-limit**.

## 3. Intégration dans transpose-cv

Point d'ancrage actuel (`api/src/services/llm/registry.ts`) :

```
getActiveProvider(id) → provider local (clé API) → si env.LLM_MESH → MeshLlmProvider(provider)
```

`MeshLlmProvider` (`mesh-adapter.ts`) construit `createLlmMesh({ registry,
authResolver })` avec un **authResolver factice** (`token:
'injected-client-owns-auth'`) car aujourd'hui la clé vit dans le provider local.

**Changement proposé** : introduire un mode « compte enrôlé » où l'auth ne vient
plus de la clé env mais d'un **token loué dans le pool**.

```
LLM_AUTH_MODE = api-key (défaut) | enrolled-account
```

- `api-key` : comportement actuel (aucune régression, reste le défaut).
- `enrolled-account` : `MeshLlmProvider` (ou un nouveau `MeshAccountProvider`)
  résout l'auth via `account-transports.acquire({ targetProviderId, modelId,
  ownerScopeRef })`, injecte le token loué, exécute, puis reporte l'`outcome`.

### Stockage des credentials
Les `PreparedCredential` (access + refresh + expiry) sont **des secrets**. Trois
options, par ordre de préférence :
1. **Store applicatif chiffré** (recommandé) : table/collection dédiée, chiffrée
   au repos, avec `ownerScope`, `status`, `priority`. C'est le vrai pool.
2. Secret k8s `transpose-cv-account-pool` (JSON) — simple mais rotation lourde
   (refresh token = réécriture du secret).
3. Délégué à sentropic si un service d'enrôlement central existe (le préfère si
   on veut mutualiser les comptes entre apps).

Convention de secrets existante à respecter : `.env` + secret k8s (GH secret) +
`../sentropic/.env` (cf. `deploy/k8s/README.md`).

### Cycle de vie du token
`expiresAt` court (Google/OpenAI). Le mesh sait rafraîchir
(`EnrollmentProvider.refresh()` / transport interne) : prévoir un **refresh
paresseux** à l'acquisition (si `expiresAt` proche → refresh → persister le
nouveau token) et passer le compte en `reauth_required` si le refresh échoue.

### Multi-tenant
`ownerScope` / `ownerScopeRef` existent dans l'API. Décision à prendre :
- **Pool partagé** (tous tenants → mêmes comptes) : simple, mais mélange les
  quotas et l'attribution. 
- **Pool par tenant** : isolation propre, mais il faut enrôler par tenant.
Recommandation : démarrer **pool partagé au niveau opérateur** pour Gemini/luna,
`ownerScope = 'operator'`.

## 4. Flux d'enrôlement (opérateur, CLI)

1. `start({ providerId: 'cloud-code', mode: 'cli', redirectUri, ownerScope:
   'operator' })` → `EnrollmentSession`.
2. **device-code** : afficher `verificationUrl` + `userCode`, l'opérateur
   valide dans son navigateur (compte Google/ChatGPT), puis
   `pollForCompletion()`. **authorization-url** : ouvrir l'URL, capter le code au
   `redirectUri`, `complete({ enrollmentId, code })`.
3. `complete()` → `PreparedCredential` ; `resolve()` → métadonnées
   (`cloudaicompanionProject` pour Gemini).
4. Persister comme `AccountTransportAccount` (`status: 'active'`, `priority`,
   `modelIds: ['gemini-3.8-flash']` ou `['gpt-5.6-luna']`).
5. Répéter pour ≥ 2–3 comptes par provider afin d'avoir de la marge de rotation.

Un petit script d'ops `api/scripts/enroll-account.ts` (miroir de
`smoke-tenant-e2e.ts`) suffit — pas d'UI nécessaire en phase 1.

## 5. Sélection de provider
`/api/models` continue d'exposer les 5 providers. En mode `enrolled-account`,
`openai` (luna) et `gemini` sont servis par le pool ; les autres restent en clé
API. Le défaut applicatif **reste `mistral`** (clé API), inchangé.

## 6. Sécurité
- Ne jamais logguer `accessToken`/`refreshToken` (déjà la règle).
- Chiffrement au repos du store de comptes ; accès restreint au namespace.
- Révocation : `status: 'disabled'` + suppression du refresh token ; prévoir une
  commande d'offboarding.
- `reauth_required` doit alerter (compte à ré-enrôler) sans casser le service
  (fallback sur les autres comptes / la clé API mesurée).

## 7. Découpage proposé
- **P0 (spike, ½ j)** : script `enroll-account.ts` device-code pour `cloud-code`,
  enrôler 1 compte Google, appeler Gemini via le token → prouver que le quota
  d'abonnement remplace le free-tier 20/j. Aucun changement runtime.
- **P1** : store de comptes chiffré + `LLM_AUTH_MODE=enrolled-account` +
  résolution d'auth par le pool pour `gemini`, avec report d'`outcome` et
  cooldown. Fallback clé API si pool vide.
- **P2** : `codex`/luna sur le même mécanisme ; refresh automatique ; métriques
  (comptes actifs, cooldowns, reauth).
- **P3** (option) : pool par tenant + UI d'enrôlement.

## 8. Décisions à trancher
1. **Où stockons-nous le pool ?** store applicatif chiffré (recommandé) vs secret
   k8s vs service sentropic central.
2. **Pool partagé opérateur** (recommandé) vs pool par tenant.
3. **Fallback** : si tous les comptes enrôlés sont en cooldown/reauth, retombe-t-on
   sur la clé API mesurée, ou renvoie-t-on une erreur `rate_limited` ?
4. **Périmètre providers phase 1** : Gemini d'abord (le mur actuel), luna ensuite ?
5. **Conformité ToS** : usage programmatique de comptes d'abonnement
   Google/ChatGPT — à valider côté juridique/produit avant prod.
