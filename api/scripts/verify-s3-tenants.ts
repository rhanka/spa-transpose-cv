import { clearTenantConfigCache, getTenantConfigForAdmin } from '../src/services/tenant-config.js';

const slugs = process.argv.slice(2);
const selectedSlugs = slugs.length > 0 ? slugs : ['_default', 'scalian'];

clearTenantConfigCache();

for (const slug of selectedSlugs) {
  const config = await getTenantConfigForAdmin({ explicitSlug: slug });
  console.log(`${config.slug} ${config.displayName} ${config.active ? 'active' : 'inactive'} ${config.templateKey}`);
}
