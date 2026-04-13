import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { CvData } from './cv-agent.js';
import { renderDocxToPng } from './docx-tooling.js';
import { packDocx, unpackDocx } from './docx-tools.js';
import { ensureTemplateContract, cloneTemplateContractWithVariant, type TemplateContract, type TemplateVariant } from './template-contract.js';
import { TEMPLATE_PREVIEW_SAMPLE_DATA, TEMPLATE_VARIANT_DEFINITIONS, getTemplateVariantDefinition } from './template-variant-catalog.js';
import { buildTemplateDocumentXml, getXmlHeader, writeTemplateHeader } from './template-xml.js';

const execFileAsync = promisify(execFile);

interface PreviewManifestItem {
  variant: TemplateVariant;
  label: string;
  referenceLabel: string;
  referenceSummary: string;
  docxPath: string;
  pdfPath: string;
  previewImagePath: string;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeCvData(data: CvData): CvData {
  return {
    ...data,
    name: escapeXml(data.name),
    title_line1: escapeXml(data.title_line1),
    title_line2: escapeXml(data.title_line2),
    technicalSkills: data.technicalSkills.map((skill) => ({
      label: escapeXml(skill.label),
      description: escapeXml(skill.description),
    })),
    sectors: data.sectors.map((item) => escapeXml(item)),
    domains: data.domains.map((item) => escapeXml(item)),
    experience: data.experience.map((job) => ({
      ...job,
      company: escapeXml(job.company),
      description: escapeXml(job.description),
      dates: escapeXml(job.dates),
      title: escapeXml(job.title),
      tasks: job.tasks.map((task) => escapeXml(task)),
      achievements: job.achievements.map((item) => escapeXml(item)),
      techEnvironment: escapeXml(job.techEnvironment),
    })),
    languages: data.languages.map((item) => ({
      label: escapeXml(item.label),
      level: escapeXml(item.level),
    })),
    education: data.education.map((item) => ({
      year: escapeXml(item.year),
      description: escapeXml(item.description),
    })),
    attention_cv: escapeXml(data.attention_cv),
  };
}

async function loadDefaultContract(rootDir: string): Promise<TemplateContract> {
  const apiRoot = resolveApiRoot(rootDir);
  const configPath = join(apiRoot, 'templates/tenants/_default/config.json');
  const raw = JSON.parse(await readFile(configPath, 'utf8')) as {
    templateContractVersion: string;
    variant: string;
    theme?: Record<string, string>;
    template?: unknown;
    templateContract?: unknown;
  };

  return ensureTemplateContract({
    templateContractVersion: raw.templateContractVersion,
    variant: raw.variant,
    theme: raw.theme,
    template: raw.template as never,
    templateContract: raw.templateContract,
  });
}

function resolveApiRoot(rootDir: string): string {
  const directApiRoot = resolve(rootDir);
  if (existsSync(join(directApiRoot, 'src')) && existsSync(join(directApiRoot, 'templates'))) {
    return directApiRoot;
  }

  const nestedApiRoot = resolve(rootDir, 'api');
  if (existsSync(join(nestedApiRoot, 'src')) && existsSync(join(nestedApiRoot, 'templates'))) {
    return nestedApiRoot;
  }

  throw new Error(`Unable to resolve API root from ${rootDir}`);
}

async function buildVariantDocx(params: {
  apiRoot: string;
  variant: TemplateVariant;
  contract: TemplateContract;
  data: CvData;
  outputDocxPath: string;
}): Promise<void> {
  const baseTemplatePath = join(params.apiRoot, 'templates/tenants/_default/template.docx');
  const workDir = await mkdtemp(join(tmpdir(), `template-preview-${params.variant}-`));

  try {
    const [ok, message] = await unpackDocx(baseTemplatePath, workDir);
    if (!ok) {
      throw new Error(message);
    }

    const xmlHeader = await getXmlHeader(join(workDir, 'word', 'document.xml'));
    const escapedData = escapeCvData(params.data);
    const documentXml = buildTemplateDocumentXml(escapedData, params.contract, xmlHeader);
    await writeFile(join(workDir, 'word', 'document.xml'), documentXml, 'utf8');
    await writeTemplateHeader(
      join(workDir, 'word', 'header2.xml'),
      {
        name: escapedData.name,
        title_line1: escapedData.title_line1,
        title_line2: escapedData.title_line2,
        years: escapedData.years,
      },
      params.contract,
    );

    const [packed, packedMessage] = await packDocx(workDir, params.outputDocxPath, baseTemplatePath);
    if (!packed) {
      throw new Error(packedMessage);
    }
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function createGalleryPreviewImage(pdfPath: string, outputPath: string): Promise<void> {
  const prefix = join(dirname(outputPath), `${basename(outputPath, '.png')}-preview`);
  await execFileAsync('pdftoppm', [
    '-f',
    '1',
    '-l',
    '1',
    '-scale-to-x',
    '1400',
    '-scale-to-y',
    '-1',
    '-x',
    '0',
    '-y',
    '0',
    '-W',
    '1400',
    '-H',
    '980',
    '-png',
    pdfPath,
    prefix,
  ]);
  await rename(`${prefix}-1.png`, outputPath);
}

function buildProofHtml(items: PreviewManifestItem[], proofDir: string): string {
  const cards = items.map((item) => [
    '<article class="card">',
    `  <img src="${escapeHtml(relative(proofDir, item.previewImagePath))}" alt="${escapeHtml(item.referenceLabel)}" />`,
    `  <h2>${escapeHtml(item.label)} <span>${escapeHtml(item.referenceLabel)}</span></h2>`,
    `  <p>${escapeHtml(item.referenceSummary)}</p>`,
    `  <p><a href="${escapeHtml(relative(proofDir, item.docxPath))}">DOCX</a> · <a href="${escapeHtml(relative(proofDir, item.pdfPath))}">PDF</a></p>`,
    '</article>',
  ].join('\n')).join('\n');

  return [
    '<!doctype html>',
    '<html lang="fr">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <title>Template library proof</title>',
    '  <style>',
    '    body { font-family: system-ui, sans-serif; margin: 24px; color: #122033; background: #f6f8fb; }',
    '    h1 { margin-bottom: 8px; }',
    '    p.lead { margin-bottom: 24px; color: #4d6178; }',
    '    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }',
    '    .card { background: white; border-radius: 18px; padding: 18px; box-shadow: 0 12px 28px rgba(16, 33, 50, 0.08); }',
    '    .card img { width: 100%; border: 1px solid #d7deea; border-radius: 12px; }',
    '    .card h2 { margin: 12px 0 8px; font-size: 20px; }',
    '    .card h2 span { display: block; font-size: 13px; color: #4d6178; margin-top: 4px; font-weight: 500; }',
    '    .card p { color: #31445b; line-height: 1.5; }',
    '    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }',
    '  </style>',
    '</head>',
    '<body>',
    '  <h1>Preuves de variantes DOCX</h1>',
    '  <p class="lead">Chaque aperçu provient du moteur DOCX réel, généré sur le même profil de démonstration puis rendu en image.</p>',
    `  <section class="grid">${cards}</section>`,
    '</body>',
    '</html>',
  ].join('\n');
}

export async function generateTemplateVariantPreviews(rootDir = process.cwd()): Promise<string> {
  const apiRoot = resolveApiRoot(rootDir);
  const baseContract = await loadDefaultContract(apiRoot);
  const previewRoot = join(apiRoot, 'templates/references/template-previews');
  const proofDir = join(previewRoot, 'proof');
  const staticDir = join(previewRoot, 'assets');
  await mkdir(proofDir, { recursive: true });
  await mkdir(staticDir, { recursive: true });

  const manifest: PreviewManifestItem[] = [];

  for (const variant of Object.keys(TEMPLATE_VARIANT_DEFINITIONS) as TemplateVariant[]) {
    const definition = getTemplateVariantDefinition(variant);
    const contract = cloneTemplateContractWithVariant(baseContract, variant);
    const variantDir = join(proofDir, variant);
    await mkdir(variantDir, { recursive: true });

    const docxPath = join(variantDir, `${variant}.docx`);
    await buildVariantDocx({
      apiRoot,
      variant,
      contract,
      data: TEMPLATE_PREVIEW_SAMPLE_DATA,
      outputDocxPath: docxPath,
    });

    const render = await renderDocxToPng(docxPath, variantDir);
    const previewImagePath = join(staticDir, `${variant}.png`);
    await createGalleryPreviewImage(render.pdfPath, previewImagePath);

    manifest.push({
      variant,
      label: definition.label,
      referenceLabel: definition.referenceLabel,
      referenceSummary: definition.referenceSummary,
      docxPath,
      pdfPath: render.pdfPath,
      previewImagePath,
    });
  }

  const manifestPath = join(proofDir, 'manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await writeFile(join(proofDir, 'index.html'), buildProofHtml(manifest, proofDir), 'utf8');
  return manifestPath;
}
