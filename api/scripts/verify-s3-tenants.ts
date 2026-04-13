import { clearTenantConfigCache, getTenantConfig } from '../src/services/tenant-config.js';

const slugs = process.argv.slice(2);
const selectedSlugs = slugs.length > 0 ? slugs : ['_default', 'scalian'];

clearTenantConfigCache();

for (const slug of selectedSlugs) {
  const config = await getTenantConfig({ explicitSlug: slug });
  console.log(`${config.slug} ${config.displayName} ${config.templateKey}`);
}
