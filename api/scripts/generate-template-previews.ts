import { generateTemplateVariantPreviews } from '../src/services/template-preview.ts';

const manifestPath = await generateTemplateVariantPreviews(process.cwd());
console.log(manifestPath);
