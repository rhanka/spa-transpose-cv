# Scalian CV Template Generator

## Règle absolue

**Il est INTERDIT que l'agent principal (conductor) traite les CVs lui-même.** Tout le travail de génération de CV doit être délégué à des sub-agents via l'outil Agent. Le conductor ne fait que : lister les fichiers, décompresser le template, lancer les sub-agents, vérifier leurs résultats, et produire le summary final. Si les sub-agents sont bloqués (permissions, etc.), il faut résoudre le problème de permissions — jamais reprendre le travail à leur place.

## Ce que ce fichier contient

Instructions pour transformer des CVs au format Scalian. Chaque élément ici a été utilisé et validé sur 9+ profils réels. Aucun raccourci non-testé.

## Fichiers du toolkit

```
scalian_xml.py          — Fonctions XML pour construire le document (testé, validé)
scalian_docx_tools.py   — unpack/pack/validate docx (testé, comparé byte-à-byte avec les originaux)
Scalian_Template.docx   — Template Scalian original (Fabien Antoine)
```

## Organisation des fichiers générés

Les scripts Python ad-hoc (`gen_*.py`, `build_*.py`) générés par les sub-agents doivent être écrits dans `tmp/` (ex: `tmp/gen_eugene.py`), pas à la racine du projet. Seuls les fichiers du toolkit (`scalian_xml.py`, `scalian_docx_tools.py`) et le template restent à la racine.

## Dépendances système

```bash
# Extraction de texte
pip install pandoc          # ou apt install pandoc
apt install poppler-utils   # pour pdftotext

# Conversion .doc legacy (optionnel)
apt install libreoffice
```

Pas besoin de `lxml`, `defusedxml` ou autre librairie Python spéciale — tout utilise la stdlib (`xml.dom.minidom`, `xml.etree.ElementTree`, `zipfile`).

## Workflow pour chaque CV

### Étape 1 : Extraire le contenu source

```bash
# PDF
pdftotext -layout input.pdf -

# DOCX
pandoc input.docx -t plain

# DOC legacy → convertir d'abord
libreoffice --headless --convert-to docx input.doc
pandoc input.docx -t plain
```

### Étape 2 : Préparer le répertoire de travail

```bash
# Décompresser le template (une seule fois)
python3 scalian_docx_tools.py unpack Scalian_Template.docx template/

# Copier pour ce candidat
cp -r template/ tmp/work_candidat/
```

### Étape 3 : Écrire un script Python qui génère le document

```python
import shutil, sys
from scalian_xml import *

shutil.copytree('template/', 'tmp/work_candidat/')

P = []

# === TECHNICAL SKILLS (5-7 bullets) ===
P.append(section_header("Technical SKILLS"))
P.append(skill_bullet("Label:", "Description (&gt;Ny)"))
# ... 5-7 bullets

# === SECTOR-SPECIFIC SKILLS ===
P.append(section_header("SECTOR-SPECIFIC SKILLS"))
P.append(sector_category("Sectors"))
P.append(sector_item("Sector 1"))
P.append(sector_item("Dernier secteur", page_break=True))  # page break sur le dernier

# === WORK EXPERIENCE ===
P.append(work_section_header("WORK EXPERIENCE"))
P.append(empty_para())
P.extend(job_entry(
    company="Company &#x2013; Location",
    description="Context one-liner",
    dates="MM/YYYY &#x2013; MM/YYYY",
    title="Job Title",
    tasks=["Task 1.", "Task 2.", "Task 3."],
    achievements=["Achievement 1."],  # [] si aucun
    tech_environment="Tech1, Tech2, Tech3"
))
# ... répéter pour chaque poste

# === LANGUAGES ===
P.append(section_header("LANGUAGES SKILLS"))
P.append(skill_bullet("English:", "Fluent"))

# === EDUCATION (ordre chronologique inverse : plus récent en premier) ===
P.append(section_header("EDUCATION/CERTIFICATION"))
P.append(education_line("2020", "Degree &#x2013; Institution"))
P.append(education_line("2015", "Earlier Degree &#x2013; Institution"))

# === Assembler ===
xml_hdr = get_xml_header("tmp/work_candidat/word/document.xml")
doc = assemble_document(P, xml_hdr)
with open("tmp/work_candidat/word/document.xml", "w") as f:
    f.write(doc)

update_header("tmp/work_candidat/word/header2.xml",
    name="Nom Complet",
    title_line1="Role Line 1",
    title_line2="Role Line 2",
    years="15")
```

### Étape 4 : Pack et validation

```bash
python3 scalian_docx_tools.py pack tmp/work_candidat/ output.docx --original Scalian_Template.docx
# Doit afficher "All validations PASSED!"
# Par défaut, les polices embarquées sont retirées (~2.8MB → ~25KB).
# Pour conserver les polices (rendu garanti sur machines sans Cambria) :
# python3 scalian_docx_tools.py pack tmp/work_candidat/ output.docx --original Scalian_Template.docx --keep-fonts
```

## Structure du format Scalian

```
Page 1:
┌──────────────────────────────────────────────┐
│        Technical SKILLS           (gray bar)  │
│ • Label1:  Description (>Ny)                  │  5-7 skill_bullet()
│ • Label2:  Description                        │
├──────────────────────────────────────────────┤
│     SECTOR-SPECIFIC SKILLS        (gray bar)  │
│ • Sectors                                     │  sector_category()
│   ◦ Sector 1 ... N                            │  sector_item() — dernier: page_break=True
│ • Domains                                     │
│   ◦ Domain 1 ... N                            │
└──────────────────────────────────────────────┘

Pages 2+:
┌──────────────────────────────────────────────┐
│       WORK EXPERIENCE             (gray bar)  │
│ Company – Location                (ital purp) │  job_company()
│ Context description               (smaller)   │  job_description()
│ MM/YYYY – MM/YYYY                (small)      │  job_dates()
│                                               │  spacer()
│ Job Title                         (bold purp)  │  job_title()
│                                               │  spacer()
│ Tasks:                          (bold black)   │  label_para()
│ • Task 1                                      │  bullet_item()
│ Achievements:                   (bold black)  │
│ • Achievement 1                               │
│ Technical Environment: T1, T2   (bold+regular)│  tech_env_para(label, text)
│ [répéter par poste]                           │
├──────────────────────────────────────────────┤
│       LANGUAGES SKILLS            (gray bar)  │
│       EDUCATION/CERTIFICATION     (gray bar)  │
└──────────────────────────────────────────────┘
```

## Header (header2.xml)

5 nœuds texte à remplacer via `update_header()` :

| Template       | Remplacer par        | Exemple           |
|----------------|----------------------|-------------------|
| `Fabien Antoine`| Nom complet         | `Ronald H. Ersek` |
| `CxO`          | Titre ligne 1        | `IT Leader`       |
| `Advisor`       | Titre ligne 2       | `Architect`       |
| `23`            | Années d'expérience | `35`              |

## Échappement XML — CRITIQUE

```
&  → &amp;           OBLIGATOIRE — cause #1 d'échecs
<  → &lt;
>  → &gt;
–  → &#x2013;        tiret long (dates, lieux)
'  → &#x2019;        apostrophe
é  → &#xE9;          accents français
É  → &#xC9;
è  → &#xE8;
ê  → &#xEA;
à  → &#xE0;
ç  → &#xE7;
ô  → &#xF4;
œ  → &#x0153;
```

## Règles de mapping du contenu

### Règle générale — fidélité au CV source
- **Ne jamais inventer de contenu.** Toutes les informations (compétences, postes, tâches, achievements, formations, langues) doivent provenir du CV source.
- **Mapper l'ensemble des sections** : chaque section du format Scalian doit être remplie à partir des données du CV source. Si une section est vide dans le source (ex: pas d'achievements pour un poste), la laisser vide — ne pas en fabriquer.
- Reformuler et synthétiser est OK (et encouragé). Inventer des faits, chiffres, ou réalisations ne l'est pas.
- Les skill bullets sont une synthèse thématique de l'ensemble du parcours — c'est la seule section où on "interprète" le CV source plutôt que de le recopier.
- **Achievements** en particulier : mapper ceux qui existent dans le source, ne pas en ajouter s'il n'y en a pas. Un poste sans achievements = `achievements=[]`, c'est acceptable.

### Technical Skills (5-7 bullets)
- Synthétiser en catégories thématiques, pas lister les outils un par un
- Format : `Label:` + description **littérale et développée** + `(>Ny)` si connu
- Le style doit être descriptif et verbeux (phrases complètes ou semi-complètes), PAS juste une liste d'outils séparés par des virgules
- Exemple MAUVAIS : `"AWS, Azure, GCP, Terraform, Ansible (>5y)"`
- Exemple BON : `"Defining data &amp; AI roadmaps and governance frameworks for large organizations, up to 30M$ (>10y of cumulated experience)"`
- Exemple BON : `"Structuring complex ecosystems (100+ applications), M&amp;A IT separation projects, including ERP, MES &amp; custom developments, TOGAF"`
- Chaque bullet doit décrire ce que le candidat FAIT avec ces technologies, pas juste les lister
- Utiliser `&amp;` dans les labels

### Sectors & Domains (3-5 chaque)
- Sectors = industries extraites de l'expérience
- Domains = domaines fonctionnels

### Work Experience
- **Ordre chronologique inverse** : le poste le plus récent en premier, le plus ancien en dernier
- Un entry par rôle/client distinct
- Consultants : un entry par client majeur (pas par tâche)
- Carrières >20y : détailler 10 dernières années, consolider le reste
- Tasks : 3-6, verbes d'action
- Achievements : 0-3, quantifiés si possible. **Uniquement ceux présents dans le CV source** — ne jamais en inventer. `achievements=[]` si le source n'en mentionne pas.
- Tech environment : liste à virgules

### Version française
- Headers : `COMP&#xC9;TENCES TECHNIQUES`, `EXP&#xC9;RIENCE PROFESSIONNELLE`, etc.
- Labels : `tasks_label="T&#xE2;ches :"`, `achievements_label="R&#xE9;alisations :"`, `tech_label="Environnement technique :"`
- Conventions QC : TI, F&amp;A

## Pièges connus (rencontrés en production)

1. `&` nu dans le texte → échec XML garanti. Toujours `&amp;`.
2. Le "23" dans le header : `update_header()` matche `<w:t>23</w:t>` exactement.
3. Ne modifier QUE `document.xml` et `header2.xml`. Tout le reste est intact.
4. `page_break=True` sur le dernier `sector_item()` avant WORK EXPERIENCE.
5. `empty_para()` après le header WORK EXPERIENCE.
5b. `job_entry()` ajoute automatiquement un `spacer()` à la fin (séparateur avant le poste suivant).
6. `spacer()` après les dates ET après le titre de poste.

---

## Mode Conductor (traitement par lot)

Pour traiter un lot de CVs dans `inputs/`, utiliser le pattern conductor/sub-agent.

### Le conductor (agent principal)

Le conductor :
1. Liste les fichiers dans `inputs/`
2. Décompresse le template une seule fois : `python3 scalian_docx_tools.py unpack Scalian_Template.docx template/`
3. Délègue chaque CV à un sub-agent via l'outil `Task`
4. **Vérifie le travail** de chaque sub-agent après réception du résultat
5. Produit le summary final une fois tous les CVs traités

### Prompt pour le sub-agent (via Task tool)

Chaque sub-agent reçoit ce prompt, adapté par le conductor :

```
Tu transformes un CV au format Scalian.

SOURCE : {chemin_du_cv}
NOM : {nom_ou_candidat_id}
SORTIE : outputs/Scalian_Profile_{Nom}_EN.docx
LANGUE : EN

ÉTAPES :
1. Extraire le texte :
   - PDF : pdftotext -layout {chemin} -
   - DOCX : pandoc {chemin} -t plain
   - DOC : libreoffice --headless --convert-to docx puis pandoc

2. Lire le contenu et identifier :
   - Nom complet (ou "Candidate XXXXX" si anonymisé)
   - Titre / rôle principal
   - Années d'expérience
   - Compétences techniques → 5-7 catégories thématiques
   - Secteurs / domaines
   - Chaque poste : entreprise, contexte, dates, titre, tâches, réalisations, stack technique
   - Langues et formation

3. Copier le template :
   cp -r template/ tmp/work_{id}/

4. Écrire un script Python dans tmp/ (ex: tmp/gen_{id}.py) qui importe scalian_xml et construit le document :
   - Utiliser section_header(), skill_bullet(), sector_category(), sector_item(),
     work_section_header(), empty_para(), job_entry(), education_line()
   - Utiliser get_xml_header() et assemble_document() pour écrire document.xml
   - Utiliser update_header() pour header2.xml
   - WORK EXPERIENCE : ordre chronologique inverse (poste le plus récent en premier)
   - EDUCATION : ordre chronologique inverse (diplôme le plus récent en premier)

5. Pack :
   python3 scalian_docx_tools.py pack tmp/work_{id}/ outputs/Scalian_Profile_{Nom}_EN.docx --original Scalian_Template.docx

6. Vérifier que "All validations PASSED!" apparaît.

7. Vérifier le contenu :
   pandoc outputs/Scalian_Profile_{Nom}_EN.docx -t plain | head -30

8. Retourner au conductor un tableau markdown paddé avec exactement ces 4 colonnes :

   ```markdown
   | Entrée                       | Sortie                                     | Attention CV                                                     | Attention traduction                    |
   |------------------------------|--------------------------------------------|------------------------------------------------------------------|-----------------------------------------|
   | SCALO_DevOps_138282.pdf      | Scalian_Profile_Candidate_138282_EN.docx   | Transition infra→DevOps, K8s récent. Pas de certif cloud.        | —                                       |
   ```

   - **Entrée** : nom du fichier source (sans path)
   - **Sortie** : nom du fichier produit (sans path)
   - **Attention CV** : infos manquantes, incohérences, compétences vagues, type de profil (anonymisé/nominatif), choix de consolidation
   - **Attention traduction** : titres mal interprétés, termes ambigus, certifs altérées, consolidation discutable

   Chaque colonne doit être paddée pour que le tableau soit lisible en texte brut.

RÈGLES CRITIQUES :
- Tout texte XML doit être échappé : & → &amp;, tirets → &#x2013;, apostrophes → &#x2019;
- 5-7 skill bullets, 3-5 sectors, 3-5 domains
- Tasks : 3-6 par poste, verbes d'action
- page_break=True sur le dernier sector_item
- empty_para() après WORK EXPERIENCE header
- spacer() après dates ET après titre
- Ne modifier que document.xml et header2.xml
- Scripts Python dans tmp/, pas à la racine
- Expériences et formations en ordre chronologique inverse
```

### Vérification par le conductor

Après chaque sub-agent, le conductor :

1. **Vérifie que le fichier existe** dans `outputs/`
2. **Extrait le texte** avec `pandoc output.docx -t plain` et vérifie :
   - Les 5 sections sont présentes (TECHNICAL SKILLS, SECTOR-SPECIFIC SKILLS, WORK EXPERIENCE, LANGUAGES SKILLS, EDUCATION/CERTIFICATION)
   - Le nombre de postes est cohérent avec le CV source
   - Pas de texte XML brut qui aurait fuité (`&amp;` ou `&#x2013;` visible dans le plain text = problème)
3. **Note ses propres observations** pour la colonne "Points d'attention traduction" du summary

### Summary final (produit par le conductor)

À la fin du traitement complet du lot, le conductor produit un tableau markdown paddé (colonnes alignées avec espaces). Le tableau doit être lisible en texte brut. **Le rapport doit être enregistré dans `outputs/batch_summary.md` puis converti en docx avec `pandoc outputs/batch_summary.md -o outputs/batch_summary.docx` pour permettre le copier-coller du tableau dans un mail.**

```markdown
# Scalian CV Batch Summary

| Entrée                                | Sortie                                     | Attention CV                                                     | Attention traduction                              |
|---------------------------------------|--------------------------------------------|------------------------------------------------------------------|---------------------------------------------------|
| SCALO_DevOps_138282.pdf               | Scalian_Profile_Candidate_138282_EN.docx   | Transition infra→DevOps, K8s récent (3y). Pas de certif cloud.   | —                                                 |
| Elinext_Ivan_Cloud_Software.docx      | Scalian_Profile_Ivan_EN.docx               | Pas de nom de famille. Formation en Droit, pas IT.               | —                                                 |

## Notes du conductor
- Fichiers traités : X/Y
- Échecs : [liste si applicable]
- Observations transversales : [ex: "tous les profils Scalo sont anonymisés"]
```

**Colonnes (même format que le rapport sub-agent) :**
- **Entrée** : nom du fichier source (sans path)
- **Sortie** : nom du fichier produit (sans path)
- **Attention CV** : remontés par le sub-agent — ce qui est notable, manquant ou risqué dans le CV source
- **Attention traduction** : rempli UNIQUEMENT par le conductor après vérification — couvre :
  - Titres de poste qui ont pu être mal interprétés
  - Termes techniques ambigus dans le mapping
  - Noms d'entreprises ou certifications qui auraient pu être altérés
  - Choix de consolidation discutables (carrières longues)
  - Sections qui semblent trop maigres ou trop denses par rapport au source
