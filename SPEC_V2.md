# SPEC v2 — Corrections & améliorations

> Date : 2026-03-24

## Contexte

La v1 fonctionne end-to-end (upload → Claude → DOCX → download) mais s'écarte du modèle CLAUDE.md sur plusieurs points et l'UX est trop basique.

## Corrections

### A — Downloads face-à-face + ZIP

**Pendant le traitement** — grid 2 colonnes par CV :

```
| Fichier source           | Streaming Claude                              |
|--------------------------|-----------------------------------------------|
| SCALO_139331.pdf         | ⟳ Analyse... (35s)                            |
|                          | > Extracting "AWS Solutions Architect"...      |
|                          | > 12 positions found...                       |
```

**Après traitement** — grid 4 colonnes par CV :

```
| Fichier source           | DOCX généré          | Attention CV         | Attention trad       |
|--------------------------|----------------------|----------------------|----------------------|
| SCALO_139331.pdf         | [Télécharger]        | Anonymisé. 25y IT... | Noms univ. polonais  |
```

En dessous : batch_summary.docx + ZIP complet.

Responsive : CSS grid `1fr 1fr` (streaming) / `1fr 1fr 1fr 1fr` (résultat) → `1fr` en mobile.

### B — Champs header fidèles à CLAUDE.md

JSON Claude retourne : `name`, `title_line1`, `title_line2`, `years`.
Contrainte : `title_line1` max 25 chars, `title_line2` max 25 chars.
Si dépassement → retry avec message d'erreur (pas de troncature).

### C — Nommage conforme CLAUDE.md

- `Scalian_Profile_{Nom}_EN.docx`
- Anonymisé (pattern `_XXXXX.pdf`) : `Scalian_Profile_Candidate_XXXXX_EN.docx`
- Nominatif : `Scalian_Profile_{Prenom}_EN.docx`

### D — Validation agent + conductor

**Agent** (auto-relecture après génération) :
1. Relit le DOCX via jszip+xmldom (extraire tous `<w:t>` text nodes)
2. Vérifie :
   - 5 sections présentes (TECHNICAL SKILLS, SECTOR-SPECIFIC SKILLS, WORK EXPERIENCE, LANGUAGES SKILLS, EDUCATION/CERTIFICATION)
   - Page 1 : compter `<w:p>` avant le paragraphe WORK EXPERIENCE, max 28
   - Pas de XML brut qui fuit (`&amp;`, `&#x2013;` dans le texte extrait)
   - `title_line1` et `title_line2` <= 25 chars
3. Si échec → retry 1x avec erreur détaillée renvoyée à Claude
4. Retourne tableau 4 colonnes (Entrée / Sortie / Attention CV / Attention traduction agent)

**Conductor** (validation post-agent) :
1. Relit le DOCX (même méthode)
2. Vérifie sections, cohérence nb postes vs source, XML propre
3. Remplit colonne "Attention traduction" (titres mal interprétés, termes ambigus, certifs altérées, consolidation discutable, sections trop maigres/denses)
4. Si problème critique → relance l'agent 1x

### E — Lecture DOCX en TypeScript (pas de pandoc)

Extraction texte DOCX : `jszip` unzip → `xmldom` parse `word/document.xml` → extraire `<w:t>` nodes.
Extraction texte PDF : `pdftotext` (subprocess, seul cas).
`batch_summary.docx` : généré via XML builders existants ou lib `docx`.

### F — Streaming Claude avec extended thinking

Appel Claude : `thinking: { type: "enabled", budget_tokens: 4096 }` + `stream: true`.

SSE par fichier :
```typescript
{
  fileIndex: number,
  phase: 'extracting_text' | 'calling_claude' | 'building_docx' | 'validating' | 'done' | 'error',
  thinking_delta?: string,   // tokens de raisonnement
  content_delta?: string,    // tokens de réponse
  parsed_keys?: {            // parsing optimiste du JSON en cours
    name?: string,
    title_line1?: string,
    positions?: string[],    // titres de postes extraits au fil
  },
  elapsed_ms?: number,
  error?: string,
}
```

Stall detection : > 120s sans nouveau token → "Possible blocage" affiché.

### Fidélité au CV source (nouvelle règle CLAUDE.md)

Intégrée dans le prompt système :
- Ne jamais inventer de contenu
- Reformuler/synthétiser OK, inventer non
- Skill bullets = seule section d'interprétation
- `achievements=[]` si le source n'en mentionne pas
- Chiffres, certifications, dates : reproduire fidèlement

### Prompt utilisateur

Le conductor interprète le prompt et le passe à chaque agent. Il influence toutes les colonnes, y compris "Attention traduction" du conductor.
