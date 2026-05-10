/// <reference lib="dom" />

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import JSZip from 'jszip';

const execFileAsync = promisify(execFile);
const XML_PARSER = new DOMParser();
const XML_SERIALIZER = new XMLSerializer();
const XML_NODE = {
  ELEMENT: 1,
  TEXT: 3,
  CDATA: 4,
} as const;
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const VOLATILE_ATTRS = new Set([
  'paraId',
  'textId',
  'rsidDel',
  'rsidP',
  'rsidR',
  'rsidRDefault',
  'rsidRPr',
  'rsidSect',
  'rsidTr',
]);

const CGI_GLOBAL_REPLACEMENTS: Array<[string, string]> = [];
const CGI_PRIVATE_SOURCE_CONFIG_PATH = 'tmp/private/cgi-source-private.json';
const CGI_PRIVATE_SOURCE_INPUT_PATH = 'tmp/private/cgi-source-input.docx';
const CGI_NEUTRAL_CORE_PROPERTIES = {
  creator: 'Template Intake',
  lastModifiedBy: 'Template Intake',
  title: 'Supplier Source Example',
  subject: 'Supplier Source Example',
  description: 'Fictional supplier source example for template analysis',
  keywords: '',
};

const CGI_PARAGRAPH_REPLACEMENTS = new Map<number, string>([
  [0, 'Julien MARCHAND'],
  [1, 'Directeur de projet Transformation numerique, TI & Donnees'],
  [2, "10 annees d'experience en gestion de projet, PMO et livraison TI"],
  [4, "Professionnel de la gestion de projet avec 10 annees d'experience, Julien pilote des programmes numeriques, des deploiements applicatifs et des chantiers d'amelioration operationnelle pour des organisations de taille intermediaire. Il a coordonne des equipes pluridisciplinaires, des fournisseurs externes et des comites de gouvernance sur des budgets annuels allant jusqu'a 8 M$. Son positionnement est volontairement transverse: cadrage, planification, risques, arbitrages, suivi executif et accompagnement au changement. Il intervient principalement dans des contextes de services, d'industrie et d'administration publique, avec une attention particuliere a la clarte des responsabilites, a la qualite de la communication projet et a la stabilisation de la livraison."],
  [6, 'CGI Modernisation des services clients numeriques (04/2024 to present)'],
  [7, "En tant que directeur de projet, Julien coordonne la modernisation de services clients numeriques pour une unite regionale. Il pilote la feuille de route, anime les ateliers de priorisation, organise les dependances entre les equipes produit, livraison et support, et suit l'execution des versions jusqu'au deploiement. Il a remis sous controle un portefeuille de chantiers heterogenes, introduit un rituel mensuel de gouvernance et structure un tableau de bord de capacite, risques et benefices attendus. Son intervention a permis de clarifier les priorites, de reduire les reports de versions et d'ameliorer la visibilite executive sur la trajectoire de transformation."],
  [8, 'CGI Portail de conformite operationnelle (12/2024 to present)'],
  [9, "Comme responsable de projet, Julien pilote la livraison d'un portail interne de suivi de conformite destine a plusieurs equipes d'exploitation. Il coordonne les besoins fonctionnels, le lotissement, la recette, la conduite du changement et la mise en service progressive. Il a structure le backlog, mis en place la gouvernance de risques, aligne les parties prenantes affaires et technologiques, puis accompagne l'equipe dans la definition d'un mode operatoire plus stable. Le dispositif livre ameliore la tracabilite des actions, le partage d'information entre equipes et la capacite de pilotage au niveau des gestionnaires."],
  [10, 'Technologies: Jira, Azure DevOps, Power BI, SharePoint, PostgreSQL, Docker'],
  [11, "Organisme public quebecois - PMO portefeuille numerique (06/2024 - aujourd'hui)"],
  [12, "Julien accompagne un PMO dans la structuration d'un portefeuille numerique compose de plusieurs chantiers de modernisation. Il prepare les comites, consolide les indicateurs de progression, formalise les dependances et soutient les gestionnaires dans le suivi des arbitrages. Son travail a permis d'harmoniser les statuts d'avancement, d'ameliorer la qualite des dossiers decisionnels et de rendre plus lisible la charge de livraison sur les trimestres a venir."],
  [13, 'Technologies: Excel avance, Power BI, Miro, Confluence, Azure DevOps'],
  [14, "Operateur de services RH - programme d'amelioration des operations de paie (04/2024 - aujourd'hui)"],
  [15, "En tant que chef de projet, Julien coordonne plusieurs chantiers d'amelioration autour d'un centre de services RH. Il anime les ateliers metier, documente les irritants, planifie les lots de transformation et suit les actions confiees aux equipes internes comme aux fournisseurs. Il a contribue a mieux sequencer les travaux, a stabiliser la priorisation des demandes et a aligner les attentes entre operations, TI et soutien client."],
  [16, 'Technologies: Jira, BPMN, ServiceNow, Power BI, SQL'],
  [17, "Association logistique du Saint-Laurent - coordination du programme de donnees (03/2024 - 07/2024)"],
  [18, "Julien a coordonne un chantier de cadrage visant a preparer un programme de donnees commun entre plusieurs acteurs logistiques. Il a organise les ateliers, consolide les besoins prioritaires, formalise la gouvernance cible et contribue a la preparation des scenarios de mise en oeuvre. Sa contribution a permis de transformer un ensemble d'intentions disparates en plan de travail exploitable, avec hypotheses, risques, lots et decisions attendues."],
  [19, ''],
  [20, 'Technologies: Microsoft 365, Collibra, API Management, Teams'],
  [21, "Groupe industriel canadien - separation applicative et transition operationnelle (10/2022 - 08/2024)"],
  [22, "Julien a pilote un chantier de separation applicative et de transition operationnelle pour une entite industrielle. Il a coordonne la planification des vagues, le suivi des fournisseurs, la preparation des essais et l'organisation des comites de pilotage. Il a aussi structure la gestion des risques et la communication entre les equipes sites, infrastructure, applications et metier. Le programme a gagne en previsibility, les jalons critiques ont ete mieux prepares et les impacts de bascule ont ete davantage maitrises."],
  [23, 'Technologies: SAP, MES, Jira, AWS, Google Cloud, ServiceNow'],
  [25, 'Plateforme DataKey (France, 01/2018 - aujourd\'hui) - cofondateur et responsable operations numeriques - https://pilot.datakey.io'],
  [26, "Julien a cofonde une petite plateforme SaaS de suivi documentaire et de coordination operationnelle destinee a des structures de taille moyenne. Il en supervise l'organisation des evolutions, la priorisation, la relation prestataires et le support aux utilisateurs. Le produit reste volontairement sobre: un service utile, rentable et maintenable, pense pour reduire la charge administrative, fiabiliser le suivi des dossiers et donner aux equipes une meilleure visibilite sur les actions en cours."],
  [27, 'Technologies: TypeScript, Node.js, Svelte, PostgreSQL, Docker, Scaleway'],
  [28, 'Etablissement public regional - Responsable PMO et amelioration continue (01/2022 - 09/2022)'],
  [29, "Julien a pris en charge un PMO transverse avec pour mandat de remettre de la discipline dans le pilotage: modele de statut, revues de risques, portefeuille des demandes, suivi budgetaire et routines de comites. Il a aussi accompagne les responsables d'equipe sur la clarte des responsabilites et la preparation des arbitrages. Son intervention a stabilise le mode de pilotage et reduit le temps passe a reconstituer l'information pour les directions."],
  [30, 'Technologies: Jira, Confluence, Power BI, SharePoint, Microsoft 365'],
  [31, 'Agence de services numeriques - Chef de projet gouvernance des donnees et tableaux de bord (01/2020 - 12/2021)'],
  [32, "Dans ce role, Julien a pilote plusieurs chantiers courts relies a la gouvernance de donnees, aux tableaux de bord de gestion et a l'organisation du reporting executif. Il a structure les travaux, arbitre les priorites, coordonne les contributeurs metier et TI, puis accompagne la mise en oeuvre des livrables jusqu'a leur appropriation par les equipes. L'enjeu principal etait moins technologique qu'organisationnel: clarifier qui decide, qui produit et qui exploite l'information."],
  [33, 'Technologies: Power BI, SQL, SharePoint, Teams, Excel avance'],
  [34, "Groupe de transport urbain - Responsable de projet exploitation & donnees (06/2016 - 12/2019)"],
  [35, "Julien a coordonne des projets d'amelioration de l'exploitation, du suivi d'indicateurs et de l'outillage de supervision pour plusieurs directions operationnelles. Il preparait les plans de livraison, suivait les fournisseurs, organisait les essais et structurait les decisions avec les gestionnaires. Il a notamment mis en place une gouvernance plus reguliere, des tableaux de bord partages et une meilleure priorisation des demandes d'evolution."],
  [36, 'Technologies: Tableau, SQL Server, Jira, Confluence, ServiceNow'],
  [37, 'Entreprise de services B2B - Chef de projet applicatif (09/2014 - 05/2016)'],
  [38, "Julien a demarre comme chef de projet applicatif dans un environnement de services B2B ou il coordonnait de petites evolutions, des correctifs, des deploiements et la communication avec les clients internes. Ce premier role lui a permis d'acquerir les bases de la planification, du suivi budgetaire, de la gestion des incidents de livraison et de la relation fournisseur."],
  [39, 'Technologies: Excel, MS Project, SQL, SharePoint'],
  [40, 'Cabinet de conseil regional - Coordinateur de projets TI (01/2014 - 08/2014)'],
  [41, "Au sein d'une petite equipe conseil, Julien a soutenu plusieurs missions de coordination TI: suivi des actions, preparation des comites, consolidation des statuts et production de comptes rendus de decision. Cette experience courte mais formatrice a ancre une pratique rigoureuse du pilotage, de la communication et de la remise en ordre de projets en tension."],
  [43, '2014 - Master professionnel Management de projet numerique - Universite de Lyon 2012 - Licence Gestion des organisations et systemes d\'information - IAE Lyon'],
  [45, "2024 - Scrum Product Owner et facilitation d'ateliers 2023 - Microsoft Power BI 2021 - ITIL Foundation 2019 - Prince2 Foundation 2017 - Lean management et conduite du changement"],
  [48, 'Services et secteur public'],
  [49, 'Industrie et logistique'],
  [50, 'Services RH et fonctions support'],
  [52, 'Gouvernance de portefeuille et PMO'],
  [53, 'Cadrage et pilotage de projets applicatifs'],
  [54, 'Coordination fournisseurs et budgets'],
  [55, 'Conduite du changement et accompagnement terrain'],
  [57, 'Planification, risques, arbitrages et suivi executif'],
  [58, "Animation d'ateliers, priorisation et comites de gouvernance"],
  [59, 'Tableaux de bord, reporting et amelioration continue'],
  [61, 'Programmes multi-sites et environnements hybrides'],
  [62, 'Organisations en transformation avec multiples parties prenantes'],
  [63, 'Deploiements applicatifs sous contraintes operationnelles'],
  [65, '- Jira, Azure DevOps, Confluence, SharePoint, ServiceNow, Power BI - BPMN, Excel avance, Miro, Teams, SQL - Microsoft 365, PostgreSQL, SAP, API Management, Docker'],
  [67, 'Francais (natif) Anglais (professionnel)'],
  [73, 'Pilotage de projet (planning, budget, risques, comites)'],
  [74, '10'],
  [75, '4'],
  [76, 'PMO, gouvernance et tableaux de bord'],
  [77, '8'],
  [78, '4'],
  [79, 'Outils collaboratifs et reporting (Jira, Power BI, M365)'],
  [80, '7'],
  [81, '3'],
  [83, "Gestion de projet et coordination d'equipes"],
  [84, '10'],
  [85, '4'],
  [86, "Conduite du changement et animation d'ateliers"],
  [87, '8'],
  [88, '3'],
  [89, 'Gestion fournisseurs et suivi contractuel'],
  [90, '7'],
  [91, '3'],
  [92, 'Cartographie de processus et amelioration continue'],
  [93, '6'],
  [94, '3'],
  [95, 'Pilotage de portefeuille et priorisation'],
  [96, '6'],
  [97, '3'],
  [98, 'Support operationnel et deploiements multi-sites'],
  [99, '5'],
  [100, '3'],
  [102, 'Services et administration'],
  [103, '7'],
  [104, '3'],
  [105, 'Industrie et logistique'],
  [106, '5'],
  [107, '2'],
]);

const CGI_BODY_PLAIN_TEXT_PARAGRAPH_INDEXES = new Set([
  4,
  7,
  9,
  12,
  15,
  18,
  22,
  26,
  29,
  32,
  35,
  38,
  41,
]);

interface CgiPrivateSourceConfig {
  inputPath?: string;
  globalReplacements?: Array<[string, string]>;
}

const DEFAULT_TENANT_PARAGRAPH_REPLACEMENTS = new Map<number, string>([
  [0, 'TECHNICAL SKILLS'],
  [1, 'AI & Data Strategy: <Describe strategic positioning, governance and transformation scope>.'],
  [2, 'Agentic AI & Delivery: <Describe LLM, AI engineering and delivery acceleration capabilities>.'],
  [3, 'IT Leadership: <Describe operating model, portfolio scope, teams and governance>.'],
  [4, 'Enterprise Architecture: <Describe target-state, integration and transformation capabilities>.'],
  [5, 'Full Stack Delivery: <Describe implementation leadership and hands-on capability>.'],
  [6, 'Cloud & Platform: <Describe cloud, platform engineering and operating constraints>.'],
  [7, 'Data Architecture: <Describe modeling, data products and data platform capabilities>.'],
  [8, 'Innovation Leadership: <Describe acceleration, experimentation and product mindset>.'],
  [9, 'SECTOR-SPECIFIC SKILLS'],
  [10, 'Sectors'],
  [11, '<Sector 1>'],
  [12, '<Sector 2>'],
  [13, '<Sector 3>'],
  [14, '<Sector 4>'],
  [16, 'Domains'],
  [17, '<Domain 1>'],
  [18, '<Domain 2>'],
  [19, '<Domain 3>'],
  [20, '<Domain 4>'],
  [21, 'WORK EXPERIENCE'],
  [23, '<Client / Program A> - <Location>'],
  [24, '<Client context / industry / transformation topic>'],
  [25, '<MM/YYYY> - Present'],
  [27, '<Role title>'],
  [29, 'Tasks:'],
  [30, '<Task / responsibility 1>'],
  [31, '<Task / responsibility 2>'],
  [32, '<Task / responsibility 3>'],
  [33, '<Task / responsibility 4>'],
  [35, 'Achievements:'],
  [36, '<Achievement / result 1>'],
  [37, '<Achievement / result 2>'],
  [38, '<Achievement / result 3>'],
  [40, 'Technical Environment: <Platforms>, <Cloud>, <Methods>, <Tooling>'],
  [42, '<Client / Program B> - <Location>'],
  [43, '<Client context / industry / transformation topic>'],
  [44, '<MM/YYYY> - <MM/YYYY>'],
  [46, '<Role title>'],
  [48, 'Tasks:'],
  [49, '<Task / responsibility 1>'],
  [50, '<Task / responsibility 2>'],
  [51, '<Task / responsibility 3>'],
  [53, 'Achievements:'],
  [54, '<Achievement / result 1>'],
  [55, '<Achievement / result 2>'],
  [56, '<Achievement / result 3>'],
  [58, 'Technical Environment: <Platforms>, <Cloud>, <Methods>, <Tooling>'],
  [60, '<Client / Program C> - <Location>'],
  [61, '<Client context / industry / transformation topic>'],
  [62, '<MM/YYYY> - <MM/YYYY>'],
  [64, '<Role title>'],
  [66, 'Tasks:'],
  [67, '<Task / responsibility 1>'],
  [68, '<Task / responsibility 2>'],
  [69, '<Task / responsibility 3>'],
  [71, 'Achievements:'],
  [72, '<Achievement / result 1>'],
  [73, '<Achievement / result 2>'],
  [74, '<Achievement / result 3>'],
  [76, 'Technical Environment: <Platforms>, <Cloud>, <Methods>, <Tooling>'],
]);

const DEFAULT_TENANT_GLOBAL_REPLACEMENTS: Array<[string, string]> = [
  ['7030A0', '23435B'],
  ['E6E6E6', 'E8EEF4'],
  ['595959', '4D6478'],
  ['1F497D', '23435B'],
  ['4F81BD', '3498DB'],
  ['C0504D', '7C8C99'],
  ['9BBB59', '4FB286'],
  ['8064A2', '5D748A'],
  ['4BACC6', '4C9BCB'],
  ['F79646', 'E9A157'],
  ['0000FF', '3498DB'],
  ['800080', '2C3E50'],
  ['Candidate Name', 'Candidate Name'],
  ['CANDIDATE NAME', 'CANDIDATE NAME'],
  ['CxO', 'Executive'],
  ['Advisor', 'Consulting Lead'],
  ['SCALIAN CANADA', 'CV OPTIMIZER'],
  ['Scalian', ''],
  ['scalian.com', 'cv.sent-tech.ca'],
  ['1751 Richardson Street, Suite 2.204, Montréal (QC) - H3K 1G6 - Canada', ''],
  ['Tel: (514) 933 6161', ''],
];

function localName(name: string | null): string {
  if (!name) {
    return '';
  }

  const match = name.match(/(?:.*:)?([^:]+)$/);
  return match?.[1] ?? name;
}

function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function applyTextReplacements(input: string, replacements: Array<[string, string]>): string {
  return replacements.reduce((value, [from, to]) => value.replaceAll(from, to), input);
}

async function loadCgiPrivateSourceConfig(rootDir: string): Promise<CgiPrivateSourceConfig> {
  const configPath = resolve(rootDir, CGI_PRIVATE_SOURCE_CONFIG_PATH);

  try {
    const raw = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw) as CgiPrivateSourceConfig;
    return {
      inputPath: typeof parsed.inputPath === 'string' ? parsed.inputPath : undefined,
      globalReplacements: Array.isArray(parsed.globalReplacements)
        ? parsed.globalReplacements.filter(
            (item): item is [string, string] =>
              Array.isArray(item)
              && item.length === 2
              && typeof item[0] === 'string'
              && typeof item[1] === 'string',
          )
        : [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('ENOENT')) {
      return {};
    }
    throw error;
  }
}

function replaceXmlTagContent(source: string, tagName: string, value: string): string {
  const escapedValue = value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

  return source.replace(
    new RegExp(`(<${tagName}[^>]*>)([\\s\\S]*?)(</${tagName}>)`, 'g'),
    `$1${escapedValue}$3`,
  );
}

function neutralizeCorePropertiesXml(source: string): string {
  let next = source;
  next = replaceXmlTagContent(next, 'dc:creator', CGI_NEUTRAL_CORE_PROPERTIES.creator);
  next = replaceXmlTagContent(next, 'cp:lastModifiedBy', CGI_NEUTRAL_CORE_PROPERTIES.lastModifiedBy);
  next = replaceXmlTagContent(next, 'dc:title', CGI_NEUTRAL_CORE_PROPERTIES.title);
  next = replaceXmlTagContent(next, 'dc:subject', CGI_NEUTRAL_CORE_PROPERTIES.subject);
  next = replaceXmlTagContent(next, 'dc:description', CGI_NEUTRAL_CORE_PROPERTIES.description);
  next = replaceXmlTagContent(next, 'cp:keywords', CGI_NEUTRAL_CORE_PROPERTIES.keywords);
  return next;
}

async function loadDocx(docxPath: string): Promise<JSZip> {
  return JSZip.loadAsync(await readFile(docxPath));
}

async function saveDocx(zip: JSZip, outputPath: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  await writeFile(outputPath, buffer);
}

function isXmlLikePart(name: string): boolean {
  return name.endsWith('.xml') || name.endsWith('.rels') || name === '[Content_Types].xml';
}

function getElementChildren(node: Node, tagName?: string): Element[] {
  const matches: Element[] = [];

  for (let index = 0; index < node.childNodes.length; index += 1) {
    const child = node.childNodes.item(index);
    if (!child || child.nodeType !== XML_NODE.ELEMENT) {
      continue;
    }

    if (!tagName || localName(child.nodeName) === tagName) {
      matches.push(child as Element);
    }
  }

  return matches;
}

function getDescendantElements(node: Node, tagName: string): Element[] {
  const matches: Element[] = [];

  const visit = (current: Node): void => {
    for (let index = 0; index < current.childNodes.length; index += 1) {
      const child = current.childNodes.item(index);
      if (!child || child.nodeType !== XML_NODE.ELEMENT) {
        continue;
      }

      if (localName(child.nodeName) === tagName) {
        matches.push(child as Element);
      }

      visit(child);
    }
  };

  visit(node);
  return matches;
}

function removeNonPropertiesChildren(paragraph: Element): void {
  const toRemove: Node[] = [];

  for (let index = 0; index < paragraph.childNodes.length; index += 1) {
    const child = paragraph.childNodes.item(index);
    if (!child) {
      continue;
    }

    if (child.nodeType === XML_NODE.ELEMENT && localName(child.nodeName) === 'pPr') {
      continue;
    }

    toRemove.push(child);
  }

  toRemove.forEach((child) => paragraph.removeChild(child));
}

function createWordElement(document: Document, tagName: string): Element {
  return document.createElementNS(WORD_NS, `w:${tagName}`);
}

function appendRunText(document: Document, run: Element, text: string): void {
  const textNode = createWordElement(document, 't');
  if (/^\s|\s$|  /.test(text)) {
    textNode.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  }

  textNode.appendChild(document.createTextNode(text));
  run.appendChild(textNode);
}

function runHasBold(textElement: Element): boolean {
  const run = textElement.parentNode;
  if (!run || run.nodeType !== XML_NODE.ELEMENT) {
    return false;
  }

  const runProperties = getElementChildren(run as Element, 'rPr')[0];
  if (!runProperties) {
    return false;
  }

  return getElementChildren(runProperties, 'b').length > 0 || getElementChildren(runProperties, 'bCs').length > 0;
}

function clearTextElements(textElements: Element[]): void {
  textElements.forEach((textElement) => {
    textElement.textContent = '';
  });
}

function findReferenceRunProperties(textElements: Element[], preferNonBoldRuns: boolean): Element | undefined {
  const candidates = preferNonBoldRuns
    ? [...textElements.filter((textElement) => !runHasBold(textElement)), ...textElements.filter((textElement) => runHasBold(textElement))]
    : textElements;

  for (const textElement of candidates) {
    const run = textElement.parentNode;
    if (!run || run.nodeType !== XML_NODE.ELEMENT) {
      continue;
    }

    const runProperties = getElementChildren(run as Element, 'rPr')[0];
    if (runProperties) {
      return runProperties;
    }
  }

  return undefined;
}

function fillTextElements(textElements: Element[], text: string, preferNonBoldRuns = false): void {
  if (textElements.length === 0) {
    return;
  }

  let workingElements = textElements;

  if (preferNonBoldRuns) {
    const nonBoldElements = textElements.filter((textElement) => !runHasBold(textElement));
    if (nonBoldElements.length > 0) {
      clearTextElements(textElements.filter((textElement) => runHasBold(textElement)));
      workingElements = nonBoldElements;
    }
  }

  let cursor = 0;

  workingElements.forEach((textElement, index) => {
    const originalLength = textElement.textContent?.length ?? 0;
    const remaining = Math.max(text.length - cursor, 0);

    if (index === workingElements.length - 1) {
      textElement.textContent = text.slice(cursor);
      cursor = text.length;
      return;
    }

    const chunkLength = Math.min(originalLength, remaining);
    textElement.textContent = text.slice(cursor, cursor + chunkLength);
    cursor += chunkLength;
  });

  if (cursor < text.length) {
    const lastElement = workingElements[workingElements.length - 1];
    lastElement.textContent = `${lastElement.textContent ?? ''}${text.slice(cursor)}`;
  }
}

function setParagraphText(paragraph: Element, text: string, options?: { preferNonBoldRuns?: boolean; forceSingleRun?: boolean }): void {
  const existingTextElements = getDescendantElements(paragraph, 't');
  if (!options?.forceSingleRun && existingTextElements.length > 0) {
    fillTextElements(existingTextElements, text, options?.preferNonBoldRuns ?? false);
    return;
  }

  const referenceRunProperties = existingTextElements.length > 0
    ? findReferenceRunProperties(existingTextElements, options?.preferNonBoldRuns ?? false)
    : undefined;

  removeNonPropertiesChildren(paragraph);
  if (!text) {
    return;
  }

  const document = paragraph.ownerDocument;
  if (!document) {
    return;
  }

  const run = createWordElement(document, 'r');
  if (referenceRunProperties) {
    run.appendChild(referenceRunProperties.cloneNode(true));
  }
  const lines = text.split('\n');

  lines.forEach((line, index) => {
    if (index > 0) {
      run.appendChild(createWordElement(document, 'br'));
    }
    appendRunText(document, run, line);
  });

  paragraph.appendChild(run);
}

function serializeXml(document: Document): string {
  return XML_SERIALIZER.serializeToString(document);
}

function updateDocumentParagraphs(
  xml: string,
  replacements: Map<number, string>,
  clearAfterIndex?: number,
  plainTextParagraphIndexes?: Set<number>,
): string {
  const document = XML_PARSER.parseFromString(xml, 'application/xml');
  const paragraphs = getDescendantElements(document, 'p');

  paragraphs.forEach((paragraph, index) => {
    if (replacements.has(index)) {
      setParagraphText(paragraph, replacements.get(index) ?? '', {
        preferNonBoldRuns: plainTextParagraphIndexes?.has(index) ?? false,
        forceSingleRun: plainTextParagraphIndexes?.has(index) ?? false,
      });
      return;
    }

    if (clearAfterIndex !== undefined && index > clearAfterIndex) {
      setParagraphText(paragraph, '');
    }
  });

  return serializeXml(document);
}

function ensureStoryParagraphs(root: Element, texts: string[]): void {
  const directParagraphs = getElementChildren(root, 'p');
  const document = root.ownerDocument;
  if (!document) {
    return;
  }

  while (directParagraphs.length < texts.length) {
    const paragraph = createWordElement(document, 'p');
    root.appendChild(paragraph);
    directParagraphs.push(paragraph);
  }

  directParagraphs.forEach((paragraph, index) => {
    setParagraphText(paragraph, texts[index] ?? '');
  });
}

function updateStoryXml(xml: string, texts: string[]): string {
  const document = XML_PARSER.parseFromString(xml, 'application/xml');
  ensureStoryParagraphs(document.documentElement, texts);
  return serializeXml(document);
}

function canonicalizeNode(node: Node): string {
  if (node.nodeType === XML_NODE.TEXT || node.nodeType === XML_NODE.CDATA) {
    return '';
  }

  if (node.nodeType !== XML_NODE.ELEMENT) {
    return '';
  }

  const element = node as Element;
  const attrs = Array.from({ length: element.attributes.length }, (_, index) => element.attributes.item(index))
    .filter((attr): attr is Attr => Boolean(attr))
    .filter((attr) => !VOLATILE_ATTRS.has(localName(attr.name)))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((attr) => `${localName(attr.name)}=${JSON.stringify(attr.value)}`)
    .join(',');

  const children = Array.from({ length: element.childNodes.length }, (_, index) => element.childNodes.item(index))
    .filter((child): child is ChildNode => Boolean(child))
    .map((child) => canonicalizeNode(child))
    .filter(Boolean)
    .join('');

  return `<${localName(element.nodeName)}${attrs ? ` ${attrs}` : ''}>${children}</${localName(element.nodeName)}>`;
}

function normalizeXmlForStyle(xml: string): string {
  return canonicalizeNode(XML_PARSER.parseFromString(xml, 'application/xml').documentElement);
}

export async function renderDocxToPng(docxPath: string, outputDir: string): Promise<{ pdfPath: string; pngPaths: string[] }> {
  await mkdir(outputDir, { recursive: true });
  const libreOfficeProfile = await mkdtemp(join(tmpdir(), 'lo-profile-'));

  try {
    await execFileAsync('soffice', [
      `-env:UserInstallation=file://${libreOfficeProfile}`,
      '--headless',
      '--convert-to',
      'pdf',
      '--outdir',
      outputDir,
      docxPath,
    ]);
  } finally {
    await rm(libreOfficeProfile, { recursive: true, force: true });
  }

  const pdfPath = join(outputDir, `${basename(docxPath, '.docx')}.pdf`);
  await execFileAsync('pdftoppm', ['-png', pdfPath, join(outputDir, 'page')]);
  const pngPaths = (await readdir(outputDir))
    .filter((entry) => entry.startsWith('page-') && entry.endsWith('.png'))
    .sort()
    .map((entry) => join(outputDir, entry));

  return { pdfPath, pngPaths };
}

async function identifyImageSize(imagePath: string): Promise<{ width: number; height: number }> {
  const { stdout } = await execFileAsync('identify', ['-format', '%w %h', imagePath]);
  const [width, height] = stdout.trim().split(/\s+/).map((value) => Number.parseInt(value, 10));

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(`Unable to identify image size for ${imagePath}`);
  }

  return { width, height };
}

async function createPlaceholderImage(outputPath: string, size: { width: number; height: number }, label: string): Promise<void> {
  await execFileAsync('convert', [
    '-size',
    `${size.width}x${size.height}`,
    'xc:#f7f9fc',
    '-gravity',
    'center',
    '-fill',
    '#5b6678',
    '-pointsize',
    '32',
    '-annotate',
    '0',
    label,
    outputPath,
  ]);
}

async function createSideBySideProofs(sourcePngs: string[], candidatePngs: string[], outputDir: string): Promise<string[]> {
  await mkdir(outputDir, { recursive: true });
  const proofPaths: string[] = [];
  const pageCount = Math.max(sourcePngs.length, candidatePngs.length);

  for (let index = 0; index < pageCount; index += 1) {
    const outputPath = join(outputDir, `page-${String(index + 1).padStart(2, '0')}-side-by-side.png`);
    let leftPath = sourcePngs[index];
    let rightPath = candidatePngs[index];
    let placeholderPath: string | undefined;

    if (!leftPath && !rightPath) {
      continue;
    }

    if (!leftPath || !rightPath) {
      const referencePath = leftPath ?? rightPath;
      if (!referencePath) {
        continue;
      }

      const size = await identifyImageSize(referencePath);
      placeholderPath = join(outputDir, `page-${String(index + 1).padStart(2, '0')}-placeholder.png`);
      await createPlaceholderImage(
        placeholderPath,
        size,
        leftPath ? 'Candidat manquant' : 'Source manquante',
      );

      if (!leftPath) {
        leftPath = placeholderPath;
      }

      if (!rightPath) {
        rightPath = placeholderPath;
      }
    }

    try {
      await execFileAsync('montage', [
        leftPath,
        rightPath,
        '-mode',
        'concatenate',
        '-tile',
        '2x1',
        '-background',
        'white',
        outputPath,
      ]);
    } finally {
      if (placeholderPath) {
        await rm(placeholderPath, { force: true });
      }
    }

    proofPaths.push(outputPath);
  }

  return proofPaths;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function writeVisualReportHtml(params: {
  outputPath: string;
  summary: {
    styleEqual: boolean;
    pageCountEqual: boolean;
    sourcePageCount: number;
    candidatePageCount: number;
  };
  sourcePngs: string[];
  candidatePngs: string[];
  proofPngs: string[];
}): Promise<void> {
  const pageCount = Math.max(params.sourcePngs.length, params.candidatePngs.length, params.proofPngs.length);
  const rows = Array.from({ length: pageCount }, (_, index) => {
    const sourcePng = params.sourcePngs[index];
    const candidatePng = params.candidatePngs[index];
    const proofPng = params.proofPngs[index];
    const sourceHref = sourcePng ? escapeHtml(relative(dirname(params.outputPath), sourcePng)) : '';
    const candidateHref = candidatePng ? escapeHtml(relative(dirname(params.outputPath), candidatePng)) : '';
    const proofHref = proofPng ? escapeHtml(relative(dirname(params.outputPath), proofPng)) : '';

    return [
      '<section class="page-pair">',
      `  <h2>Page ${index + 1}</h2>`,
      proofHref ? `  <p><a href="${proofHref}">Ouvrir la preuve image composite</a></p>` : '',
      '  <div class="pair-grid">',
      sourceHref
        ? `    <figure><figcaption>Source</figcaption><img src="${sourceHref}" alt="Source page ${index + 1}" /></figure>`
        : '    <figure><figcaption>Source</figcaption><div class="missing">Page manquante</div></figure>',
      candidateHref
        ? `    <figure><figcaption>Candidat</figcaption><img src="${candidateHref}" alt="Candidate page ${index + 1}" /></figure>`
        : '    <figure><figcaption>Candidat</figcaption><div class="missing">Page manquante</div></figure>',
      '  </div>',
      '</section>',
    ].join('\n');
  }).join('\n');

  const html = [
    '<!doctype html>',
    '<html lang="fr">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <title>DOCX style diff report</title>',
    '  <style>',
    '    body { font-family: system-ui, sans-serif; margin: 24px; color: #122033; }',
    '    .summary { display: grid; gap: 8px; margin-bottom: 24px; }',
    '    .pair-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start; }',
    '    img { width: 100%; border: 1px solid #d7deea; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08); }',
    '    figcaption { margin-bottom: 8px; font-weight: 700; }',
    '    .missing { min-height: 400px; display: grid; place-items: center; border: 1px dashed #d7deea; background: #f7f9fc; }',
    '  </style>',
    '</head>',
    '<body>',
    '  <h1>Rapport visuel de diff DOCX</h1>',
    '  <div class="summary">',
    `    <div><strong>styleEqual</strong>: ${params.summary.styleEqual}</div>`,
    `    <div><strong>pageCountEqual</strong>: ${params.summary.pageCountEqual}</div>`,
    `    <div><strong>sourcePageCount</strong>: ${params.summary.sourcePageCount}</div>`,
    `    <div><strong>candidatePageCount</strong>: ${params.summary.candidatePageCount}</div>`,
    '  </div>',
    rows,
    '</body>',
    '</html>',
  ].join('\n');

  await mkdir(dirname(params.outputPath), { recursive: true });
  await writeFile(params.outputPath, html, 'utf8');
}

export async function createCgiSourceExample(rootDir = process.cwd()): Promise<string> {
  const privateConfig = await loadCgiPrivateSourceConfig(rootDir);
  const inputPath = resolve(
    rootDir,
    process.env.CGI_SOURCE_RAW_DOCX
      ?? privateConfig.inputPath
      ?? CGI_PRIVATE_SOURCE_INPUT_PATH,
  );
  const outputPath = resolve(rootDir, 'api/templates/references/cgi_source_example_fictional.docx');
  const zip = await loadDocx(inputPath);
  const globalReplacements = [
    ...CGI_GLOBAL_REPLACEMENTS,
    ...(privateConfig.globalReplacements ?? []),
  ];

  for (const entryName of Object.keys(zip.files)) {
    const entry = zip.file(entryName);
    if (!entry || !isXmlLikePart(entryName)) {
      continue;
    }

    let text = await entry.async('text');

    if (entryName === 'word/document.xml') {
      text = updateDocumentParagraphs(text, CGI_PARAGRAPH_REPLACEMENTS, undefined, CGI_BODY_PLAIN_TEXT_PARAGRAPH_INDEXES);
    }

    if (entryName === 'docProps/core.xml') {
      text = neutralizeCorePropertiesXml(text);
    }

    text = applyTextReplacements(text, globalReplacements);
    zip.file(entryName, text);
  }

  await saveDocx(zip, outputPath);
  return outputPath;
}

export async function createDefaultTenantSeed(rootDir = process.cwd()): Promise<string> {
  const inputPath = resolve(rootDir, 'api/templates/references/scalian_source_reference.docx');
  const outputPath = resolve(rootDir, 'api/templates/tenants/_default/template.docx');
  const zip = await loadDocx(inputPath);
  const clearAfterIndex = Math.max(...DEFAULT_TENANT_PARAGRAPH_REPLACEMENTS.keys());

  for (const entryName of Object.keys(zip.files)) {
    const entry = zip.file(entryName);
    if (!entry || !isXmlLikePart(entryName)) {
      continue;
    }

    let text = await entry.async('text');

    if (entryName === 'word/document.xml') {
      text = updateDocumentParagraphs(text, DEFAULT_TENANT_PARAGRAPH_REPLACEMENTS, clearAfterIndex);
    } else if (/^word\/header\d+\.xml$/.test(entryName)) {
      text = updateStoryXml(text, ['Candidate Name', 'Executive Consulting Headline', 'XX years of experience']);
    } else if (/^word\/footer\d+\.xml$/.test(entryName)) {
      text = updateStoryXml(text, ['']);
    }

    zip.file(entryName, applyTextReplacements(text, DEFAULT_TENANT_GLOBAL_REPLACEMENTS));
  }

  await saveDocx(zip, outputPath);
  return outputPath;
}

export interface DocxStyleDiffOptions {
  sourceDocxPath: string;
  candidateDocxPath: string;
  outputJsonPath: string;
  renderDir: string;
  diffLimit?: number;
}

export async function compareDocxStyle(options: DocxStyleDiffOptions): Promise<string> {
  const sourceDocxPath = resolve(options.sourceDocxPath);
  const candidateDocxPath = resolve(options.candidateDocxPath);
  const outputJsonPath = resolve(options.outputJsonPath);
  const renderDir = resolve(options.renderDir);
  const diffLimit = options.diffLimit ?? 20;

  const [sourceZip, candidateZip] = await Promise.all([
    loadDocx(sourceDocxPath),
    loadDocx(candidateDocxPath),
  ]);

  const sourceParts = Object.keys(sourceZip.files).filter((name) => !sourceZip.files[name]?.dir).sort();
  const candidateParts = Object.keys(candidateZip.files).filter((name) => !candidateZip.files[name]?.dir).sort();
  const missingInCandidate = sourceParts.filter((part) => !candidateZip.files[part]);
  const extraInCandidate = candidateParts.filter((part) => !sourceZip.files[part]);
  const sharedParts = sourceParts.filter((part) => candidateZip.files[part]);
  const xmlDifferences: Array<{ part: string; sourceHash: string; candidateHash: string; diffs: string[] }> = [];
  const binaryDifferences: Array<{ part: string; sourceHash: string; candidateHash: string }> = [];
  let identicalParts = 0;

  for (const part of sharedParts) {
    const [sourceContent, candidateContent] = await Promise.all([
      sourceZip.file(part)?.async('nodebuffer'),
      candidateZip.file(part)?.async('nodebuffer'),
    ]);

    if (!sourceContent || !candidateContent) {
      continue;
    }

    if (isXmlLikePart(part)) {
      const sourceNormalized = normalizeXmlForStyle(sourceContent.toString('utf8'));
      const candidateNormalized = normalizeXmlForStyle(candidateContent.toString('utf8'));

      if (sourceNormalized === candidateNormalized) {
        identicalParts += 1;
        continue;
      }

      xmlDifferences.push({
        part,
        sourceHash: sha256Hex(sourceNormalized),
        candidateHash: sha256Hex(candidateNormalized),
        diffs: [`normalized XML mismatch for ${part}`].slice(0, diffLimit),
      });
      continue;
    }

    if (sourceContent.equals(candidateContent)) {
      identicalParts += 1;
      continue;
    }

    binaryDifferences.push({
      part,
      sourceHash: sha256Hex(sourceContent),
      candidateHash: sha256Hex(candidateContent),
    });
  }

  const [sourceRender, candidateRender] = await Promise.all([
    renderDocxToPng(sourceDocxPath, join(renderDir, 'source')),
    renderDocxToPng(candidateDocxPath, join(renderDir, 'candidate')),
  ]);

  const styleEqual =
    missingInCandidate.length === 0 &&
    extraInCandidate.length === 0 &&
    xmlDifferences.length === 0 &&
    binaryDifferences.length === 0;
  const pageCountEqual = sourceRender.pngPaths.length === candidateRender.pngPaths.length;
  const htmlReportPath = join(renderDir, 'compare', 'index.html');
  const proofPngs = await createSideBySideProofs(
    sourceRender.pngPaths,
    candidateRender.pngPaths,
    join(renderDir, 'compare'),
  );

  await writeVisualReportHtml({
    outputPath: htmlReportPath,
    summary: {
      styleEqual,
      pageCountEqual,
      sourcePageCount: sourceRender.pngPaths.length,
      candidatePageCount: candidateRender.pngPaths.length,
    },
    sourcePngs: sourceRender.pngPaths,
    candidatePngs: candidateRender.pngPaths,
    proofPngs,
  });

  const report = {
    styleReport: {
      source: sourceDocxPath,
      candidate: candidateDocxPath,
      styleEqual,
      partsCompared: sourceParts.length,
      identicalParts,
      missingInCandidate,
      extraInCandidate,
      xmlDifferences,
      binaryDifferences,
    },
    visualReport: {
      sourcePageCount: sourceRender.pngPaths.length,
      candidatePageCount: candidateRender.pngPaths.length,
      pageCountEqual,
      sourcePdf: sourceRender.pdfPath,
      candidatePdf: candidateRender.pdfPath,
      sourcePages: sourceRender.pngPaths,
      candidatePages: candidateRender.pngPaths,
      comparisonPages: proofPngs,
      htmlReport: htmlReportPath,
    },
  };

  await mkdir(dirname(outputJsonPath), { recursive: true });
  await writeFile(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return outputJsonPath;
}
