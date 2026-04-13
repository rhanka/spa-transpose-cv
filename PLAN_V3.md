# PLAN v3 — Évolutions

## 1. Disclaimer / Conditions d'utilisation (first-time warning)

**Comportement** : au premier usage, un modal bloquant s'affiche. L'utilisateur doit accepter pour continuer. Le consentement est stocké dans `localStorage`. Ne réapparaît plus ensuite.

**Contenu du disclaimer** :
- Données stockées sur Scaleway, région Paris (France)
- Stockage chiffré AES-256-GCM, clé dérivée du mot de passe utilisateur
- Analyse par Claude Sonnet 4.6 (Anthropic)
- Effacement automatique des données au-delà de 48h
- Produit développé par Sent-Tech
- Sent-Tech dégage toute responsabilité d'usage au-delà de ces conditions standard
- L'utilisateur assume les conditions légales et réglementaires du pays d'utilisation

**Implémentation** : composant Svelte `Disclaimer.svelte` affiché dans `+layout.svelte` si `localStorage.getItem('disclaimer_accepted')` est null.

## 2. Conductor "error to fix" — diagnostic + fix

**Problème constaté** : le conductor renvoie souvent "error to fix" mais :
- a) Le reprompting avec les erreurs ne fonctionne pas correctement
- b) Certaines erreurs sont fausses — probablement parce que le source et l'output envoyés au conductor sont tronqués (`.substring(0, 3000)`)

**Diagnostic à faire** :
- Vérifier dans `orchestrator.ts` : le `sourceText.substring(0, 3000)` et `outputText.substring(0, 3000)` → le conductor ne voit qu'un extrait, donc il signale des "manques" qui sont en fait après la troncature
- Vérifier la logique de relance : `attention_trad.toLowerCase().includes('error to fix')` → est-ce que la relance se fait vraiment et avec le bon feedback ?

**Fix proposé** :
- Augmenter la fenêtre envoyée au conductor (tout le texte, pas 3000 chars)
- Si le texte combiné est trop long pour Claude, faire un résumé structurel (nombre de postes, sections présentes) plutôt qu'un extrait tronqué
- Rendre le prompt conductor plus explicite : "le texte source et output sont COMPLETS, ne signale pas de manque sauf si vraiment absent"

## 3. FinOps — tracking tokens et coûts

**Pricing Claude Sonnet 4.6** (à confirmer, tarifs actuels) :
- Input : $3 / 1M tokens
- Output : $15 / 1M tokens

**Implémentation** :
- À chaque appel Claude (agent extraction + conductor QA), récupérer `response.usage.input_tokens` et `response.usage.output_tokens` du retour API
- Stocker par fichier dans le meta : `{ input_tokens, output_tokens, cost_usd }` (cumul agent + conductor)
- Afficher dans la colonne DOCX (sous le nom du fichier) : `1.2k/3.4k tokens — $0.05`
- Dans le batch summary : total tokens + coût total

**UI** : texte discret sous le nom du fichier dans la colonne DOCX de la grid résultat.
