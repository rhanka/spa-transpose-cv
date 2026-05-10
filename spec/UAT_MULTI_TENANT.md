# UAT_MULTI_TENANT.md

## Objectif

Valider localement deux flux distincts :

1. le flux public tenant-aware de conversion CV
2. le flux admin de création d’espace société

## Commande de référence

```bash
make uat-localhost
```

Par défaut, le smoke utilise :

- API locale : `http://localhost:8686/api`
- UI locale : `http://localhost:5175`
- console MinIO : `http://localhost:9001`
- interface Maildev : `http://localhost:1081`
- document d'entrée : `api/templates/references/cgi_source_example_fictional.docx`
- mot de passe de session : `smoke-pass`

Bootstrap stockage local :

```bash
make storage-dev-bootstrap
```

Génération d’un mot de passe admin local temporaire :

```bash
make admin-hash PASSWORD='change-me'
```

## Critères d'acceptation

### Flux public

- la session est créée sur le tenant demandé
- l'upload est accepté
- le rendu atteint l'état `done`
- `results.tenant` correspond au tenant demandé
- le téléchargement retourne un artefact non vide

### Flux admin

- le formulaire `_default` demande `site de référence + adresse de vérification + exemple DOCX`
- le flux OTP réserve bien le slug attendu
- `POST /api/admin/tenants` crée un brouillon inactif après code valide
- l'accès opérateur Sent Tech publie directement le tenant quand les secrets admin sont configurés

## Checklist visuelle localhost

### `_default` / Sent Tech

- le header et le hero affichent `Sent Tech`, sans le mot `tenant`
- le favicon affiché est le carré Sent Tech
- le hero reprend le fond Sent Tech d’origine
- le logo wordmark Sent Tech reste lisible sur fond sombre
- la page d'origine ouvre par défaut le builder de création d’espace société
- le builder expose `Site de référence`, `Adresse de vérification`, `Exemple DOCX`, `Code de vérification`
- aucun champ `Slug attendu` n'est visible
- l’accès opérateur Sent Tech n’apparaît pas comme une option publique principale
- la page d'origine expose aussi une `Bibliothèque de styles BetterCV` dans le mode conversion
- le changement de template n'apparaît pas sur la page de session
- aucun champ `Entreprise cible` n'est visible

### `scalian`

- le favicon affiché est spécifique à Scalian
- le header et le hero utilisent un fond plein cohérent avec la marque
- le branding Scalian reste inchangé hors shell/favicons
- aucune bibliothèque de templates n'est affichée

### `cgi`

- `/cgi/` n'est pas publié en local par défaut
- `GET /api/tenants/cgi/config` retourne `404`

## Smoketests utiles

Smoke `_default` par défaut :

```bash
make uat-localhost
```

Smoke `_default` avec variante explicite :

```bash
make uat-tenant TENANT=_default TEMPLATE_VARIANT=professional-compact
```

## Validation manuelle builder/admin

Pré-requis :

- secrets admin présents en environnement (`ADMIN_PASSWORD_HASH`, `ADMIN_PASSWORD_SALT`, `ADMIN_SEED_SECRET`)
- exemple CGI fictif disponible dans `api/templates/references/`

Cas nominal OTP :

1. `POST /api/admin/claims/request-otp` avec `companyUrl=https://www.cgi.com` et `corporateEmail=admin@cgi.com`
2. récupérer le code local via Maildev ou le champ `devOtp` en environnement de développement
3. `POST /api/admin/tenants` avec `challengeId + otp + templateFile`
4. vérifier la réponse `201` avec `active=false` et `templateProfile=cgi`
5. vérifier que `GET /api/tenants/cgi/config` retourne `404` tant que le brouillon n'est pas publié

Cas nominal admin racine :

1. `POST /api/admin/tenants` avec `companyUrl`, un email opérateur, `rootAdminPassword` et `templateFile`
2. vérifier la réponse `201` avec `active=true`
3. vérifier que `GET /api/tenants/{slug}/config` retourne `200`

## Dernière validation locale

Date : `2026-04-11`

Résultats :

- `_default` : OK via `make uat-localhost`
- `scalian` : OK via `make uat-localhost`
- builder admin : OK en validation manuelle avec secrets temporaires, puis reset de la stack locale à l'état nominal
