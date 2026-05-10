# SPEC_EVOL_MULTI_TENANT.md — Evolution multi-tenant, stockage et auth

> Date : 2026-04-10
> Statut : Draft qualifié

## 1. Scope

Cette spec couvre :
- la résolution de tenant
- le stockage S3 SCW
- le chargement de thème et de template
- l'auth admin DB-less
- la migration de `scalian-cv.sent-tech.ca` vers `cv.sent-tech.ca/{slug}/`

Elle ne couvre pas en détail :
- le contrat du template-agent
- le catalogue de variantes
- la migration complète du runtime LLM

Ces sujets sont détaillés dans `spec/SPEC_EVOL_TEMPLATE_AGENT.md`.

## 2. Résolution de tenant

### 2.1 Mode nominal

Mode retenu :
- host canonique unique : `cv.sent-tech.ca`
- résolution tenant par premier segment de chemin

Règles :
- `/` -> tenant `_default`
- `/{slug}` ou `/{slug}/` -> tenant `{slug}`
- `/session/{id}` -> session du tenant `_default`
- `/{slug}/session/{id}` -> session du tenant `{slug}`

Slugs réservés :
- `api`
- `admin`
- `session`

### 2.2 Compatibilité legacy

Compatibilité assurée par redirection :
- `https://scalian-cv.sent-tech.ca` -> `https://cv.sent-tech.ca/scalian/`

Ce n'est plus le mode nominal de résolution.

## 3. Chargement du tenant côté UI

Au boot SPA :
1. lire `window.location.pathname`
2. extraire le slug si le premier segment n'est pas réservé
3. résoudre `_default` sinon
4. appeler `GET /api/tenants/{slug}/config`
5. appliquer les tokens du thème
6. charger le layout et les labels du tenant

Le build UI reste unique.

## 4. Chargement du tenant côté API

L'API résout le tenant par ordre de priorité :
1. paramètre explicite de route
2. header `X-Tenant`
3. repli `_default`

La config tenant est :
- chargée depuis S3
- gardée en cache mémoire court
- considérée comme immuable à l'échelle d'une requête

## 5. Stockage S3

### 5.1 Bucket

Bucket dédié :
- nom cible : `cv-transpose-config`
- région : `fr-par`
- endpoint : `https://s3.fr-par.scw.cloud`

### 5.2 Arborescence

```text
cv-transpose-config/
  registry.json
  tenants/_default/config.json
  tenants/_default/template.docx
  tenants/_default/theme.css
  tenants/scalian/config.json
  tenants/scalian/template.docx
  tenants/scalian/theme.css
  tenants/{slug}/config.json
  tenants/{slug}/template.docx
  tenants/{slug}/theme.css
  claims/{slug}.json
```

### 5.3 Contenu de `config.json`

```json
{
  "slug": "scalian",
  "displayName": "Scalian",
  "routeBase": "/scalian/",
  "brandUrl": "https://www.scalian.com",
  "themeKey": "tenants/scalian/theme.css",
  "templateKey": "tenants/scalian/template.docx",
  "templateContractVersion": "v1",
  "variant": "brand-accent",
  "active": true
}
```

### 5.4 Migration minimale de phase 1

Migration retenue :
- `_default`
  - template neutre basé sur Scalian neutralisé
- `scalian`
  - template Scalian actuel

La migration initiale ne déplace pas d'autres historiques ni entités métier.

## 6. Mapping de thème

Le design system dérivé d'un site client est volontairement restreint.

Tokens à dériver :
- couleurs principales
- couleurs de surface
- couleur d'accent
- typo heading
- typo body
- rayon de bord éventuel
- logo

Composants couverts :
- header
- hero
- boutons
- inputs
- cartes
- footer
- panneaux de progression

Le but n'est pas de reproduire tout le site client, mais uniquement le sous-ensemble utile au produit CV.

## 7. Auth admin DB-less

### 7.1 Rôles utiles

Rôles de phase 1 :
- `root-admin`
  - opérateur Sent Tech
- `space-claimant`
  - premier propriétaire d'un espace société

### 7.2 Secrets

Secrets requis :
- `ADMIN_PASSWORD_HASH`
- `ADMIN_PASSWORD_SALT` ou `ADMIN_SEED_SECRET`
- credentials S3 bucket dédié
- configuration SMTP

### 7.3 Revendication d'espace société

Flux retenu :
1. l'utilisateur saisit URL société, email corporate, slug souhaité
2. l'application dérive le domaine attendu
3. l'application vérifie la cohérence domaine email / slug / domaine société
4. envoi OTP par email
5. si OTP validé :
  - création du lock S3 `claims/{slug}.json`
  - stockage du hash du premier email validé
  - création de la config tenant en état `draft`

Override :
- `root-admin` peut reprendre ou corriger un espace

### 7.4 Ce qui n'est pas requis en phase 1

- base SQL
- session utilisateur persistée complexe
- WebAuthn
- OAuth entreprise

## 8. DNS et domaines

### 8.1 Principe

Principe retenu :
- un seul domaine canonique : `cv.sent-tech.ca`
- pas d'update DNS applicatif au runtime normal

### 8.2 Tâches infra hors flux applicatif

À traiter côté exploitation :
- création du CNAME canonique
- mise en place de la redirection legacy `scalian-cv.sent-tech.ca`

L'application n'a pas besoin d'un token Cloudflare large pour la suite.

## 9. Impacts UI/API

### 9.1 UI

Refactors attendus :
- rendre le layout tenant-aware
- charger les tokens à chaud au boot
- faire porter le slug sur les routes de session

### 9.2 API

Nouveaux besoins :
- client S3 SCW
- cache config tenant
- endpoints admin minimaux
- endpoints de lecture tenant

Endpoints probables :
- `GET /api/tenants/:slug/config`
- `POST /api/admin/claims/request-otp`
- `POST /api/admin/claims/verify-otp`
- `POST /api/admin/tenants`

## 10. Séquencement de migration

1. Introduire le chargement de config tenant depuis S3
2. Introduire le routing path-based
3. Introduire `_default` et `scalian`
4. Introduire la redirection legacy
5. Introduire l'admin claim DB-less
6. Introduire ensuite les tenants nouveaux

## 11. Tests attendus

- résolution correcte de `_default`
- résolution correcte de `scalian`
- refus des slugs réservés
- isolement des sessions par tenant
- chargement thème/config S3 robuste
- flux OTP corporate valide
- collision de claim correctement bloquée

## 12. Points encore ouverts

- nom final exact du bucket
- niveau d'override autorisé au `root-admin`

Décision actée :
- `cgi` sera le premier nouveau tenant publié pour valider le flux de création/publication
- `scalian` reste intégré comme référence de non-régression pendant cette montée en charge
