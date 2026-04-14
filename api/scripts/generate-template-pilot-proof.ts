import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { templateVariantSchema } from '../src/services/template-contract.ts';
import { generateTemplatePilotProof } from '../src/services/template-preview.ts';

const [variantArg, referenceImagePathArg, outputDirArg] = process.argv.slice(2);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

if (!variantArg || !referenceImagePathArg) {
  console.error(
    'Usage: node --experimental-strip-types api/scripts/generate-template-pilot-proof.ts <variant> <reference-image> [output-dir]',
  );
  process.exit(1);
}

const variant = templateVariantSchema.parse(variantArg);
const reportPath = await generateTemplatePilotProof({
  rootDir: repoRoot,
  variant,
  referenceImagePath: referenceImagePathArg,
  outputDir: outputDirArg,
});

console.log(reportPath);
