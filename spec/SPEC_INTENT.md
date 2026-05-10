# SPEC_INTENT.md — Vision produit CV Transpose Multi-tenant

> Date : 2026-04-10
> Auteur : équipe produit
> Statut : Draft qualifié

## 1. Contexte

Le projet `spa-transpose-cv` est aujourd'hui une SPA brandée Scalian qui convertit des CV PDF/DOCX vers un format DOCX homogène au moyen d'un orchestrateur LLM parallèle.

Socle existant réutilisable :
- UI SvelteKit 5 statique, aujourd'hui publiée sur `scalian-cv.sent-tech.ca`
- API Hono / Node 24 / TypeScript, aujourd'hui publiée sur `scalian-cv-api.sent-tech.ca`
- outillage DOCX/OOXML TypeScript déjà en place
- stockage de sessions chiffrées, éphémères, sans base de données
- pipeline de build/deploy déjà opérationnel

L'intention n'est plus de maintenir un produit Scalian-only, mais d'en faire une plateforme CV multi-tenant, DB-less, réutilisable pour plusieurs sociétés de conseil.

## 2. Vision cible

Le produit cible est `cv.sent-tech.ca`, avec deux usages principaux mutualisés.

### 2.1 CV Optimizer

But :
- convertir un CV source vers un format plus facile à lire pour les ATS et sites de recrutement
- fournir un template neutre, dérivé du modèle Scalian mais sans logo ni marque
- proposer ensuite plusieurs variantes visuelles sûres pour les ATS

Sorties attendues :
- DOCX propre et homogène
- structure stable
- peu de dépendance à la marque
- lisibilité forte pour Workday, Taleo, SuccessFactors et assimilés

### 2.2 White-label Site Builder

But :
- permettre à une société de conseil de disposer d'un espace CV brandé à partir :
  - de son site public, pour dériver un mini design system exploitable
  - de son template CV DOCX, pour dériver un contrat de rendu OOXML

Le site résultant partage :
- le même moteur d'upload et d'extraction
- le même pipeline de mapping CV -> structure cible
- le même runtime API
- le même build UI

## 3. Principes non négociables

- DB-less : aucune base métier, la configuration tenant est stockée en S3 Scaleway
- mutualisation maximale entre le tenant neutre et les tenants marque
- aucune dépendance forte à un sous-domaine par tenant dans la phase 1
- aucun token DNS large dans le conteneur applicatif
- aucun `Co-Authored-By`
- le CV CGI fourni sert de référence d'analyse et ne doit pas être commité brut

## 4. Décisions déjà qualifiées

Décisions consolidées après récupération de la session Claude `fd867de2-819c-4ff1-9993-4e422d86c826` et analyse complémentaire du 2026-04-10 :

- Le mode de résolution principal sera path-based :
  - `cv.sent-tech.ca/` -> tenant `_default`
  - `cv.sent-tech.ca/scalian/` -> tenant `scalian`
  - `cv.sent-tech.ca/{slug}/` -> autres tenants
- Les anciens sous-domaines sont traités comme des redirections de compatibilité, pas comme le mode nominal.
- La phase 1 n'a besoin que d'un seul CNAME canonique pour `cv.sent-tech.ca`.
- L'application ne pilotera pas des créations DNS tenant par tenant au runtime.
- La première migration S3 ne transporte que le template Scalian et l'éventuelle métadonnée de thème associée.
- Le scraping de marque est limité aux composants réellement rendus dans l'UI, pas à une réplication exhaustive du site client.
- Un agent d'analyse de template DOCX produit un contrat de structure cible consommé par le moteur de mapping existant.
- Le runtime agent reste celui des providers déjà intégrés, sans couche supplémentaire de framework.

## 5. Flux prioritaires

### 5.1 Flux utilisateur neutre

1. Arrivée sur `cv.sent-tech.ca/`
2. Upload du CV source
3. Choix du provider/modèle
4. Conversion vers le template neutre
5. Téléchargement DOCX
6. Option future : choix d'une variante visuelle ATS-safe

### 5.2 Flux admin tenant

1. Authentification simple opérateur
2. Déclaration ou revendication d'un espace société
3. Vérification d'email sur domaine corporate
4. Scraping de marque à partir de l'URL du site
5. Upload du template DOCX de la société
6. Génération du contrat de template + du thème
7. Stockage en S3
8. Publication sur `cv.sent-tech.ca/{slug}/`

### 5.3 Flux utilisateur tenant

1. Arrivée sur `cv.sent-tech.ca/{slug}/`
2. Chargement du thème et du contrat tenant
3. Upload CV
4. Conversion vers le template cible du tenant
5. Téléchargement DOCX

## 6. Stratégie template

Trois familles de template structurent la suite :

- Template Scalian actuel : base historique, déjà industrialisée
- Template CGI neutralisé : référence d'analyse interne, utile pour enrichir le contrat cible
- Template neutre commun : synthèse ATS-first des patterns Scalian + CGI, sans marque

Le template neutre commun doit conserver :
- un header exécutif court : nom, titre, années d'expérience
- une structure mono-colonne robuste
- des sections à ordre stable
- des styles simples, sans photo ni mise en page exotique

## 7. Stockage de configuration

Le stockage léger multi-tenant bascule vers un bucket S3 SCW dédié :

```text
cv-transpose-config/
  registry.json
  tenants/_default/config.json
  tenants/_default/template.docx
  tenants/_default/theme.css
  tenants/scalian/config.json
  tenants/scalian/template.docx
  tenants/scalian/theme.css
  tenants/{slug}/...
```

Ce stockage porte :
- l'index des tenants
- les contrats de thème
- les templates DOCX
- les éventuels assets brandés
- les locks de revendication d'espace

## 8. Sécurité d'administration

La cible de phase 1 n'est pas une auth riche type B2B.

Elle repose sur :
- un mot de passe admin hashé en `.env`
- un secret de seed/salt en `.env`
- une vérification OTP par email corporate pour la revendication d'un espace société
- un verrou first-come-first-served stocké en S3
- une possibilité d'override par l'admin racine Sent Tech

Le but est la simplicité opératoire, pas une IAM complète.

## 9. Documents de suite

La suite de la spécification est désormais répartie ainsi :

- `spec/SPEC_INTENT_QA_SESSION.md`
  - transcription qualifiée des réponses Q1 à Q12
- `spec/SPEC_EVOL_MULTI_TENANT.md`
  - architecture produit, routing, stockage, auth, migration
- `spec/SPEC_EVOL_TEMPLATE_AGENT.md`
  - stratégie template, variantes, agents, contrat de rendu

## 10. Questions résiduelles

Les sujets encore à figer avant implémentation large sont limités :

- quelles variantes visuelles livrer en première vague, parmi le catalogue neutre
Décisions déjà actées :
- `scalian` reste intégré comme base de non-régression
- `cgi` devient le premier tenant publié de test pour valider le flux d'ajout d'un nouveau tenant
