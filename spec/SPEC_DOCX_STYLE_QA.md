# SPEC_DOCX_STYLE_QA.md

## Objectif

Poser une boucle fiable pour comparer un document source DOCX et un document genere, afin de
prouver qu'il n'existe plus aucune difference de style entre les deux.

Le texte peut changer. Le style, la structure OOXML et la pagination cible ne doivent pas bouger.

## 1. Analyse des differences

La comparaison doit se faire a deux niveaux :

1. Structure OOXML hors texte
   - comparer toutes les parties du `.docx`
   - ignorer le texte (`w:t`, `w:delText`, `w:instrText`)
   - ignorer les attributs volatils Word (`rsid*`, `paraId`, `textId`)
   - comparer ensuite le XML normalise et les binaires restants

2. Validation visuelle
   - rendre source et candidat en PDF puis en PNG
   - verifier que le nombre de pages est identique
   - verifier visuellement les pages cote a cote

## 2. Interpretation

Le document est conforme uniquement si :

- `styleEqual = true`
- `pageCountEqual = true`
- les pages rendues confirment visuellement la meme grille, les memes marges, la meme hierarchie,
  les memes tables, les memes en-tetes/pieds et les memes accents de marque

## 3. Mitigation

Quand des differences sont detectees :

1. ne pas regenerer la structure DOCX avec un moteur de recreation documentaire si l'objectif est de conserver le style
2. repartir du document source
3. patcher uniquement le texte dans les parties XML du package
4. garder intact :
   - `word/document.xml` hors texte
   - styles, themes, numbering
   - headers, footers, tables, images, relations
5. rerendre et relancer l'audit

## 4. Recette

Commandes :

```bash
make create-cgi-source-example
make docx-style-diff \
  SOURCE_DOCX='tmp/private/cgi-source-input.docx' \
  CANDIDATE_DOCX='api/templates/references/cgi_source_example_fictional.docx' \
  OUTPUT_JSON='tmp/docs/style-diff-after/report.json' \
  RENDER_DIR='tmp/docs/style-diff-after'
```

Sorties attendues :

- rapport JSON avec `styleEqual=true`
- `sourcePageCount == candidatePageCount`
- images `page-XX-side-by-side.png` sous `tmp/docs/style-diff-after/compare/`
- rapport HTML visuel sous `tmp/docs/style-diff-after/compare/index.html`

## 4.b Architecture

- les methodes mutualisees vivent dans `api/src/services/docx-tooling.ts`
- `api/scripts/*` ne sont que des points d'entree temporaires pour `make`
- la logique reusable doit rester appelable ensuite par l'agent et les flux applicatifs

## 5. Impact produit

Pour la generation d'un template a partir d'un exemple fournisseur dans l'application :

- utiliser d'abord l'exemple pour analyser le contrat de template
- si un document de reference fictif est produit pour les tests, le generer par patch textuel
  OOXML et non par recreation de la structure
- ajouter ce controle de style a la boucle QA avant de considerer un template comme valide
