import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { scrapeBrandTheme } from '../src/services/brand-scraper-agent.js';

const [sourceUrl, outputArg] = process.argv.slice(2);

if (!sourceUrl || !outputArg) {
  console.error('Usage: tsx api/scripts/scrape-brand.ts <url> <output.json>');
  process.exit(1);
}

const outputPath = resolve(outputArg);
const result = await scrapeBrandTheme(sourceUrl);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

console.log(outputPath);
