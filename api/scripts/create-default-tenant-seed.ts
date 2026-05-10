// Temporary make entrypoint. Shared logic lives in api/src/services/docx-tooling.ts.
import { createDefaultTenantSeed } from '../src/services/docx-tooling.ts';

const outputPath = await createDefaultTenantSeed(process.cwd());
console.log(outputPath);
