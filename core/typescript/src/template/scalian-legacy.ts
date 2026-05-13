import type { CvData } from '../cv/profile.js';
import type { TemplateContract } from './contract.js';

function pid(): string {
  const n = Math.floor(Math.random() * (0x4fffffff - 0x40000000 + 1)) + 0x40000000;
  return n.toString(16).toUpperCase().padStart(8, '0');
}

const F = '<w:rFonts w:ascii="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria" w:cs="Cambria"/>';
const PR = 'w:rsidR="00035852" w:rsidRDefault="001652D9"';
const PR0 = 'w:rsidR="00035852" w:rsidRDefault="00035852"';
const BDR =
  '<w:pBdr><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:between w:val="nil"/></w:pBdr>';

function sectionHeader(title: string): string {
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    '<w:pPr><w:widowControl w:val="0"/>' +
    '<w:shd w:val="clear" w:color="auto" w:fill="E6E6E6"/>' +
    '<w:spacing w:before="240" w:after="240" w:line="300" w:lineRule="auto"/>' +
    '<w:jc w:val="center"/>' +
    `<w:rPr>${F}<w:b/><w:bCs/><w:smallCaps/><w:color w:val="7030A0"/></w:rPr>` +
    '</w:pPr>' +
    `<w:r><w:rPr>${F}<w:b/><w:bCs/><w:smallCaps/><w:color w:val="7030A0"/></w:rPr>` +
    `<w:t>${title}</w:t></w:r></w:p>`
  );
}

function workSectionHeader(title: string): string {
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
    '<w:shd w:val="clear" w:color="auto" w:fill="E6E6E6"/>' +
    '<w:tabs><w:tab w:val="left" w:pos="1620"/><w:tab w:val="center" w:pos="5058"/></w:tabs>' +
    '<w:spacing w:before="240"/>' +
    `<w:rPr>${F}<w:b/><w:bCs/><w:smallCaps/><w:color w:val="7030A0"/></w:rPr>` +
    '</w:pPr>' +
    `<w:r><w:rPr>${F}<w:b/><w:bCs/><w:smallCaps/><w:color w:val="7030A0"/></w:rPr>` +
    `<w:tab/><w:tab/><w:t>${title}</w:t></w:r></w:p>`
  );
}

function skillBullet(label: string, description: string): string {
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    '<w:pPr><w:widowControl w:val="0"/>' +
    '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr>' +
    '<w:tabs><w:tab w:val="left" w:pos="539"/></w:tabs>' +
    '<w:spacing w:line="300" w:lineRule="auto"/>' +
    `<w:rPr>${F}<w:color w:val="000000" w:themeColor="text1"/></w:rPr>` +
    '</w:pPr>' +
    `<w:r><w:rPr>${F}<w:b/><w:bCs/><w:color w:val="7030A0"/></w:rPr>` +
    `<w:t>${label}</w:t></w:r>` +
    `<w:r><w:rPr>${F}<w:color w:val="7030A0"/></w:rPr>` +
    '<w:t xml:space="preserve"> </w:t></w:r>' +
    `<w:r><w:rPr>${F}<w:color w:val="000000" w:themeColor="text1"/></w:rPr>` +
    `<w:t>${description}</w:t></w:r></w:p>`
  );
}

function sectorCategory(label: string): string {
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    '<w:pPr><w:widowControl w:val="0"/>' +
    '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr>' +
    `${BDR}` +
    '<w:tabs><w:tab w:val="left" w:pos="539"/></w:tabs>' +
    '<w:spacing w:line="300" w:lineRule="auto"/>' +
    '<w:ind w:left="709" w:hanging="425"/>' +
    `<w:rPr>${F}<w:color w:val="7030A0"/></w:rPr>` +
    '</w:pPr>' +
    `<w:r><w:rPr>${F}<w:color w:val="7030A0"/></w:rPr>` +
    `<w:t>${label}</w:t></w:r></w:p>`
  );
}

function sectorItem(text: string, pageBreak = false): string {
  const pb = pageBreak ? '<w:r><w:br w:type="page"/></w:r>' : '';
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    '<w:pPr><w:widowControl w:val="0"/>' +
    '<w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr>' +
    '<w:tabs><w:tab w:val="left" w:pos="539"/></w:tabs>' +
    '<w:spacing w:line="300" w:lineRule="auto"/>' +
    '<w:jc w:val="both"/>' +
    `<w:rPr>${F}</w:rPr>` +
    '</w:pPr>' +
    `<w:r><w:rPr>${F}</w:rPr><w:t>${text}</w:t></w:r>${pb}</w:p>`
  );
}

function spacer(): string {
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR0}>` +
    `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
    '<w:spacing w:line="300" w:lineRule="auto"/>' +
    '<w:jc w:val="both"/>' +
    `<w:rPr>${F}</w:rPr></w:pPr></w:p>`
  );
}

function emptyPara(): string {
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR0}>` +
    '<w:pPr><w:tabs><w:tab w:val="left" w:pos="1620"/>' +
    '<w:tab w:val="center" w:pos="5058"/></w:tabs></w:pPr></w:p>'
  );
}

function jobCompany(text: string): string {
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
    '<w:spacing w:line="300" w:lineRule="auto"/><w:jc w:val="both"/>' +
    `<w:rPr>${F}<w:b/><w:bCs/><w:i/><w:iCs/><w:color w:val="7030A0"/></w:rPr>` +
    '</w:pPr>' +
    `<w:r><w:rPr>${F}<w:b/><w:bCs/><w:i/><w:iCs/><w:color w:val="7030A0"/></w:rPr>` +
    `<w:t>${text}</w:t></w:r></w:p>`
  );
}

function jobDescription(text: string): string {
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
    '<w:spacing w:line="300" w:lineRule="auto"/><w:jc w:val="both"/>' +
    `<w:rPr>${F}<w:b/><w:bCs/><w:i/><w:iCs/><w:color w:val="7030A0"/>` +
    '<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>' +
    '</w:pPr>' +
    `<w:r><w:rPr>${F}<w:b/><w:bCs/><w:i/><w:iCs/><w:color w:val="7030A0"/>` +
    '<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>' +
    `<w:t>${text}</w:t></w:r></w:p>`
  );
}

function jobDates(text: string): string {
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
    '<w:spacing w:line="300" w:lineRule="auto"/><w:jc w:val="both"/>' +
    `<w:rPr>${F}<w:b/><w:bCs/><w:i/><w:iCs/><w:color w:val="7030A0"/>` +
    '<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>' +
    '</w:pPr>' +
    `<w:r><w:rPr>${F}<w:b/><w:bCs/><w:i/><w:iCs/><w:color w:val="7030A0"/>` +
    '<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>' +
    `<w:t>${text}</w:t></w:r></w:p>`
  );
}

function jobTitle(text: string): string {
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
    '<w:spacing w:line="300" w:lineRule="auto"/><w:jc w:val="both"/>' +
    `<w:rPr>${F}<w:b/><w:bCs/><w:color w:val="7030A0"/></w:rPr>` +
    '</w:pPr>' +
    `<w:r><w:rPr>${F}<w:b/><w:bCs/><w:color w:val="7030A0"/></w:rPr>` +
    `<w:t>${text}</w:t></w:r></w:p>`
  );
}

function labelPara(text: string): string {
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
    '<w:ind w:right="-57"/>' +
    `<w:rPr>${F}<w:color w:val="000000"/></w:rPr>` +
    '</w:pPr>' +
    `<w:r><w:rPr>${F}<w:b/><w:bCs/><w:color w:val="000000"/></w:rPr>` +
    `<w:t>${text}</w:t></w:r></w:p>`
  );
}

function bulletItem(text: string): string {
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    '<w:pPr><w:widowControl w:val="0"/>' +
    '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>' +
    `${BDR}` +
    '<w:ind w:right="-57"/>' +
    `<w:rPr>${F}<w:color w:val="000000"/></w:rPr>` +
    '</w:pPr>' +
    `<w:r><w:rPr>${F}<w:color w:val="000000"/></w:rPr>` +
    `<w:t>${text}</w:t></w:r></w:p>`
  );
}

function techEnvPara(label: string, text: string): string {
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    `<w:pPr><w:widowControl w:val="0"/>${BDR}` +
    '<w:spacing w:line="300" w:lineRule="auto"/>' +
    '<w:ind w:right="-57"/>' +
    `<w:rPr>${F}<w:color w:val="000000"/></w:rPr>` +
    '</w:pPr>' +
    `<w:r><w:rPr>${F}<w:b/><w:bCs/><w:color w:val="000000"/></w:rPr>` +
    `<w:t>${label}</w:t></w:r>` +
    `<w:r><w:rPr>${F}<w:color w:val="000000"/></w:rPr>` +
    `<w:t xml:space="preserve"> ${text}</w:t></w:r></w:p>`
  );
}

function educationLine(year: string, text: string): string {
  return (
    `    <w:p w14:paraId="${pid()}" w14:textId="77777777" ${PR}>` +
    '<w:pPr><w:widowControl w:val="0"/>' +
    '<w:tabs><w:tab w:val="left" w:pos="1276"/></w:tabs>' +
    '<w:spacing w:before="120" w:after="120" w:line="300" w:lineRule="auto"/>' +
    '<w:ind w:left="1270" w:hanging="1270"/>' +
    `<w:rPr>${F}</w:rPr>` +
    '</w:pPr>' +
    `<w:r><w:rPr>${F}</w:rPr>` +
    `<w:t>${year}</w:t><w:tab/><w:t>${text}</w:t></w:r></w:p>`
  );
}

function jobEntry(opts: CvData['experience'][number]): string[] {
  const parts = [
    jobCompany(opts.company),
    jobDescription(opts.description),
    jobDates(opts.dates),
    spacer(),
    jobTitle(opts.title),
    spacer(),
    labelPara('Tasks:'),
  ];

  for (const task of opts.tasks) {
    parts.push(bulletItem(task));
  }

  if (opts.achievements.length > 0) {
    parts.push(labelPara('Achievements:'));
    for (const achievement of opts.achievements) {
      parts.push(bulletItem(achievement));
    }
  }

  parts.push(techEnvPara('Technical Environment:', opts.techEnvironment));
  parts.push(spacer());
  return parts;
}

const SECT_PR = `    <w:sectPr w:rsidR="00035852" w:rsidRPr="00633E15">
      <w:headerReference w:type="even" r:id="rId7"/>
      <w:headerReference w:type="default" r:id="rId8"/>
      <w:footerReference w:type="default" r:id="rId9"/>
      <w:pgSz w:w="12242" w:h="15842"/>
      <w:pgMar w:top="83" w:right="992" w:bottom="567" w:left="1134" w:header="120" w:footer="555" w:gutter="0"/>
      <w:pgNumType w:start="1"/>
      <w:cols w:space="720"/>
    </w:sectPr>
  </w:body>
</w:document>`;

export function buildLegacyScalianDocumentXml(
  data: CvData,
  _contract: TemplateContract,
  xmlHeader: string,
): string {
  const paragraphs: string[] = [];

  paragraphs.push(sectionHeader('Technical SKILLS'));
  for (const skill of data.technicalSkills.slice(0, 7)) {
    paragraphs.push(skillBullet(skill.label, skill.description));
  }

  paragraphs.push(sectionHeader('SECTOR-SPECIFIC SKILLS'));
  if (data.sectors.length > 0) {
    paragraphs.push(sectorCategory('Sectors'));
    data.sectors.forEach((sector, index) => {
      paragraphs.push(sectorItem(sector, index === data.sectors.length - 1 && data.domains.length === 0));
    });
  }
  if (data.domains.length > 0) {
    paragraphs.push(sectorCategory('Domains'));
    data.domains.forEach((domain, index) => {
      paragraphs.push(sectorItem(domain, index === data.domains.length - 1));
    });
  }

  paragraphs.push(workSectionHeader('WORK EXPERIENCE'));
  paragraphs.push(emptyPara());
  for (const job of data.experience) {
    paragraphs.push(...jobEntry(job));
  }

  paragraphs.push(sectionHeader('LANGUAGES SKILLS'));
  for (const language of data.languages) {
    paragraphs.push(skillBullet(language.label, language.level));
  }

  paragraphs.push(sectionHeader('EDUCATION/CERTIFICATION'));
  for (const education of data.education) {
    paragraphs.push(educationLine(education.year, education.description));
  }

  return xmlHeader + paragraphs.join('\n') + '\n' + SECT_PR;
}

export function buildLegacyScalianHeaderXml(
  existingXml: string,
  data: Pick<CvData, 'name' | 'title_line1' | 'title_line2' | 'years'>,
): string {
  return existingXml
    .replace('>Fabien Antoine<', `>${data.name}<`)
    .replace('>CxO<', `>${data.title_line1}<`)
    .replace('> Advisor<', `> ${data.title_line2}<`)
    .replace('>Advisor<', `>${data.title_line2}<`)
    .replace('<w:t>23</w:t>', `<w:t>${data.years}</w:t>`);
}
