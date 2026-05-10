# normalize_docx — pseudocode partagé

Helper utilisé par les tests d'équivalence pour comparer un DOCX produit
par le port TS et un DOCX produit par le port Python. Doit être
implémenté dans chaque port avec le **même comportement bit-pour-bit**.

## Étapes

1. Décompresser le DOCX (zip).
2. Pour chaque entrée XML (`word/document.xml`, `word/styles.xml`,
   `word/header*.xml`, etc.) :
   a. Parser en arbre XML.
   b. Trier les attributs alphabétiquement sur chaque noeud.
   c. Supprimer les attributs non-déterministes :
      - `w:rsidR`, `w:rsidRPr`, `w:rsidRDefault`, `w:rsidP`, `w:rsidTr`
      - `wp14:editId`, `wp:docPr/@id`
      - tout `*Id` numérique aléatoire dans `pkg:` ou `docId`.
   d. Zéroïser les `<dcterms:created>`, `<dcterms:modified>`,
      `<cp:lastModifiedBy>` dans `docProps/core.xml`.
   e. Sérialiser avec un formatter déterministe (indentation 2 espaces,
      pas de retour à la ligne supplémentaire dans les balises vides).
3. Retourner un dict `{ entryName: normalizedXmlString }` ; les binaires
   (`media/`, `embeddings/`) sont conservés tels quels et comparés en
   hash SHA-256.

## Tests d'équivalence

- Égalité stricte sur le dict produit par le port TS et le port Python
  pour la même fixture.
- En cas de divergence, le diff doit être lisible (XPath + ligne).
