import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  analyzeTemplateDocx,
  type TemplateAnalysisProfile,
} from '../src/services/template-analysis-agent.js';

const [profileArg, inputArg, outputArg] = process.argv.slice(2);

if (!profileArg || !inputArg || !outputArg) {
  console.error('Usage: tsx api/scripts/analyze-template-docx.ts <scalian|cgi> <input.docx> <output.json>');
  process.exit(1);
}

if (profileArg !== 'scalian' && profileArg !== 'cgi') {
  console.error(`Unsupported profile "${profileArg}"`);
  process.exit(1);
}

const profile = profileArg as TemplateAnalysisProfile;
const inputPath = resolve(inputArg);
const outputPath = resolve(outputArg);

const result = await analyzeTemplateDocx(inputPath, profile);
const serialized = {
  ...result,
  sourceDocxPath: inputArg,
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(serialized, null, 2)}\n`, 'utf8');

console.log(outputPath);
