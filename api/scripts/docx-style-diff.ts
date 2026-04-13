// Temporary make entrypoint. Shared logic lives in api/src/services/docx-tooling.ts.
import { compareDocxStyle } from '../src/services/docx-tooling.ts';

const [sourceDocxPath, candidateDocxPath, outputJsonPath, renderDir, diffLimitArg] = process.argv.slice(2);

if (!sourceDocxPath || !candidateDocxPath || !outputJsonPath || !renderDir) {
  console.error('Usage: node --experimental-strip-types api/scripts/docx-style-diff.ts <source.docx> <candidate.docx> <output.json> <render-dir> [diff-limit]');
  process.exit(1);
}

const outputPath = await compareDocxStyle({
  sourceDocxPath,
  candidateDocxPath,
  outputJsonPath,
  renderDir,
  diffLimit: diffLimitArg ? Number.parseInt(diffLimitArg, 10) : undefined,
});

console.log(outputPath);
