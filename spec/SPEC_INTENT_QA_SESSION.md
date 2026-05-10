# SPEC_INTENT_QA_SESSION.md — Session Q/R consolidée

> Date : 2026-04-10
> Source principale : session Claude `fd867de2-819c-4ff1-9993-4e422d86c826`
> Statut : consolidé pour planification

## 1. Entrées exploitées

- Historique de session Claude récupéré localement
- document source CGI brut hors git analysé en OOXML
- `api/templates/references/scalian_source_reference.docx` analysé en OOXML
- BetterCV :
  - catégories observées le 2026-04-10 : `Simple`, `Modern`, `One column`, `With photo`, `Professional`, `ATS`
  - promesse globale observée : 40+ templates orientés recrutement
- Scaffolding auth/email réutilisable observé dans `top-ai-ideas-fullstack`
- Vérification complémentaire des options agent framework via documentation officielle

## 2. Bloc A — Produit, template, routing

### Q1 — CV CGI comme référence et neutralisation en template

Décision :
- utiliser le CV CGI fourni comme référence d'analyse pour comprendre un second style de société de conseil
- ne pas commiter le document source brut
- produire à terme un template CGI neutralisé et un format neutre commun Scalian/CGI

Constats OOXML utiles :
- CGI emploie une palette de marque rouge, avec `accent1 = #E31937`
- présence d'un logo embarqué et de footers de confidentialité
- structure très narrative, mono-colonne, avec forte densité de sections exécutives
- Scalian fournit au contraire un header très compact et une structure plus normée par blocs

Décision produit :
- le template neutre commun doit reprendre :
  - du Scalian : header court, structure de sortie stable, sections directement exploitables
  - du CGI : richesse du profil exécutif, densité crédible des expériences, ton consulting senior
- `cgi` devient le premier tenant publié de test pour valider le flux d'ajout d'un nouveau tenant
- `scalian` reste intégré comme base de non-régression

Tests d'acceptation :
- aucun nom, logo, footer légal, mention CGI/Scalian dans le template neutralisé
- rendu mono-colonne, sans photo, sans tableau critique pour ATS
- sections et placeholders clairement identifiables pour un agent d'analyse de template

### Q2 — Inspiration BetterCV et variantes proposées

Observations BetterCV :
- les familles visibles sont `Simple`, `Modern`, `One column`, `With photo`, `Professional`, `ATS`
- l'UX est centrée sur le choix de style avant la saisie du contenu
- l'offre marketing met en avant la compatibilité ATS

Décision produit :
- ne pas reprendre la variante `With photo` en phase 1
- retenir un petit catalogue de variantes OOXML réellement faisables et sûres pour ATS

Catalogue recommandé phase 1 :
- `ats-core`
  - une colonne, contraste fort, sections très sobres
- `consulting-classic`
  - synthèse Scalian/CGI, header exécutif + profil + expériences
- `executive-modern`
  - espacement plus généreux, bandeau d'accent discret, hiérarchie visuelle plus premium
- `professional-compact`
  - densité plus forte pour profils expérimentés, sans casser la lisibilité ATS
- `brand-accent`
  - variante tenant-aware qui n'altère que palette, police et certains blocs décoratifs sûrs

Tests d'acceptation :
- chaque variante reste compatible avec le même contrat de template
- pas de vraie mise en page photo/tableau multi-colonne dur en phase 1
- même pipeline de génération pour toutes les variantes

### Q3 — SPA multi-tenant

Décision :
- le mode acceptable de phase 1 est une SPA unique avec :
  - `/` pour la version Sent Tech / tenant `_default`
  - `/{slug}/` pour les variantes tenant
- l'ancien sous-domaine `scalian-cv.sent-tech.ca` devient une redirection vers `cv.sent-tech.ca/scalian/`

Contraintes de routing :
- réserver `admin`, `api`, `session`
- prévoir des chemins tenant-aware pour les sessions :
  - `/session/{id}` pour `_default`
  - `/{slug}/session/{id}` pour les tenants

Tests d'acceptation :
- la SPA charge le bon thème à partir du premier segment de chemin
- la session et le téléchargement restent isolés par tenant

## 3. Bloc B — Branding, agents, auth

### Q4 — Design system dérivé du site client

Décision :
- approche `b` restreinte aux composants réellement rendus
- pas d'objectif de cloner intégralement le design system du site client

Portée effective :
- mapper les tokens de marque vers les composants utilisés :
  - header
  - footer
  - hero
  - boutons
  - cartes
  - zones d'upload
  - états de progression

Tests d'acceptation :
- chaque composant rendu reçoit des tokens explicites
- pas de scraping cosmétique inutile

### Q5 — Agent de template + cadrage framework

Décision :
- créer un agent de template qui analyse intelligemment le DOCX cible
- sa sortie devient la structure cible consommée par l'agent de mapping actuel
- cadrage framework : conserver le runtime provider existant

Décision framework :
- conserver le runtime provider existant pour éviter toute regression de streaming
- LangChain : trop lourd pour la tranche actuelle
- Agno : Python-first, donc non retenu pour le runtime TypeScript

Contrat de sortie attendu du template-agent :
- placeholders header
- ordre et type des sections
- styles utiles
- règles de rendu
- contraintes de longueur

Tests d'acceptation :
- Scalian et CGI doivent produire un `TemplateContract` comparable
- le mapper existant peut viser ce contrat sans logique hardcodée par marque

### Q6 — Auth admin simple, DB-less

Décision :
- mot de passe admin hashé en `.env`
- secret de seed/salt en `.env`
- revendication d'espace société par OTP email sur domaine corporate
- verrou first-come-first-served stocké en S3
- possibilité d'override admin racine

Réemploi ciblé depuis `top-ai-ideas-fullstack` :
- service OTP email
- configuration nodemailer / Maildev
- patterns de tests email

Ce qui n'est pas retenu en phase 1 :
- WebAuthn
- système d'utilisateurs riche
- RBAC complet
- base SQL juste pour l'auth

Tests d'acceptation :
- un domaine ne peut être revendiqué qu'une fois
- un email hors domaine corporate ne peut pas finaliser la revendication
- un admin racine peut reprendre la main

### Q7 — Règle de slug

Décision :
- le slug dérive du domaine principal de l'entreprise en supprimant TLD et préfixes usuels

Exemples :
- `cgi.com` -> `cgi`
- `scalian.com` -> `scalian`
- `www.example-consulting.ca` -> `example-consulting`

Tests d'acceptation :
- slug normalisé ASCII lowercase
- collisions détectées avant création

## 4. Bloc C — DNS et exploitation

### Q8 — Un seul CNAME

Décision :
- un seul CNAME canonique pour `cv.sent-tech.ca`
- les alias tenant ne sont pas utiles dans la cible nominale

### Q9 — Réalisation opérationnelle

Décision :
- la mise en place initiale DNS/domaines peut être faite par l'opérateur
- cette tâche peut être planifiée et n'a pas besoin d'être la première implémentation applicative

### Q10 — Pas d'update DNS applicatif courant

Décision :
- le conteneur ne doit pas piloter des updates DNS de routine
- seul le bootstrap initial du domaine canonique, puis la redirection legacy, sont à traiter hors flux métier normal

Tests d'acceptation :
- l'application fonctionne sans token Cloudflare large au runtime
- la redirection de `scalian-cv.sent-tech.ca` est en place

## 5. Bloc D — Exécution, tests, migration

### Q11 — Parallélisation et UAT

Décision :
- paralléliser le travail quand c'est proprement découplable
- intégrer des étapes UAT explicites dans le plan
- réutiliser quand possible les patterns de tests et d'email de `top-ai-ideas-fullstack`

Axes parallélisables :
- spécification/template-agent
- routing tenant et thème dynamique
- stockage S3/config tenant
- auth admin simple
- stratégie de tests/UAT

### Q12 — Migration initiale vers S3

Décision :
- la reprise initiale migre seulement :
  - le template Scalian
  - l'éventuelle métadonnée de thème associée
- pas de migration massive d'historique

Tests d'acceptation :
- `_default` et `scalian` sont chargeables depuis S3
- aucun besoin de base de données

## 6. Résiduels encore ouverts

Questions restantes à arbitrer en fin de cadrage :
- sélectionner le sous-ensemble exact de variantes à implémenter en premier
