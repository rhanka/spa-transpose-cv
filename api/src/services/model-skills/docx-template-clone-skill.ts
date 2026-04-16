/**
 * Embedded model skill for DOCX template cloning in spa-transpose-cv.
 *
 * Seeded from the Anthropic DOCX skill pattern already adapted in
 * top-ai-ideas-fullstack, then rewritten for this repo's TypeScript + OOXML
 * workflow and template-clone use case.
 */

export function getDocxTemplateCloneSkill(): string {
  return `# DOCX Template Clone Skill — spa-transpose-cv

## 1. When To Use This Skill

Use this skill when the task is to clone, adapt, or converge toward a supplier-provided DOCX template inside spa-transpose-cv.

Typical cases:
- adapt a new company example DOCX into an app-compatible template
- close visual gaps on a pilot variant until page 1 is defensible
- patch OOXML conservatively instead of regenerating layout blindly

This skill is about template fidelity, not CV extraction.

## 2. Hard Constraints

- TypeScript only. Do not introduce Python.
- Work with the repo's existing DOCX / OOXML services. Do not invent a parallel runtime.
- Prefer a dedicated clone strategy when the target reference is far from the current variant.
- Never fake convergence with stretched screenshots or distorted aspect ratios.
- Keep the output ATS-readable unless the source reference explicitly requires a more complex structure.
- Do not invent content, labels, or decorative structure that is not supported by the reference or by the app's template contract.

## 3. Available Building Blocks In This Repo

- \`api/src/services/template-analysis-agent.ts\`
  - extracts section headings, fonts, colors, header hints, and a first \`TemplateContract\`
- \`api/src/services/template-contract.ts\`
  - normalizes target structure and output naming rules
- \`api/src/services/template-xml.ts\`
  - main renderer for page structure, headers, sidebars, bullets, and spacing
- \`api/src/services/docx-tools.ts\`
  - unpack / validate / repack OOXML safely
- \`api/src/services/docx-tooling.ts\`
  - render DOCX to PDF/PNG and compare style-preserving transformations
- \`api/src/services/template-preview.ts\`
  - generates preview assets and the pilot visual proof loop

## 4. Required Working Method

When the user asks for a template adaptation, follow this order:

1. Analyze the supplier example first.
   - identify page format, header geometry, sidebar usage, dominant fonts, colors, bullet style, spacing rhythm
2. Decide the strategy honestly.
   - if the target is still close to an existing variant, patch that variant
   - if it is visually far, treat it as a dedicated clone instead of overfitting generic tokens
3. Use a stable pilot dataset.
   - the same sample CV content must be rendered on every iteration
   - do not compare different content volumes across passes
4. Converge in the right order.
   - geometry first
   - typography second
   - bullets / indents / wrapping third
   - palette and contrast last
5. Validate visually after each meaningful pass.
   - use the proof loop, not intuition

## 5. Visual Proof Rules

- Reference and candidate must keep the same aspect ratio in the side-by-side proof.
- Do not resize the candidate to "fit" the reference if that distorts the page.
- Crop from a stable anchor, preferably top-left for page-1 comparison.
- If white-margin trimming is used, apply it consistently and conservatively.
- Review all of:
  - side-by-side view
  - diff heatmap
  - final PNG used by the UI preview

A proof that stretches the page is invalid.

## 6. DOCX / OOXML Rules

- Preserve page settings when cloning a reference: size, margins, printable width, header spacing.
- Prefer conservative XML patching over destructive full regeneration when the goal is style fidelity.
- Use proper Word numbering / indentation for bullets when wrapped lines must align under the text.
- Bullet wrap alignment matters as much as the bullet glyph itself.
- Preserve named styles and run structure when only text changes are needed.
- Strip embedded fonts from packed output.
- Validate XML after each structural patch.

## 7. Convergence Order

Treat these as separate checkpoints:

### 7.1 Geometry
- page size
- margins
- sidebar width
- header block height
- usable body width

### 7.2 Typography
- heading family
- body family
- title weights
- label weights
- font sizes
- line spacing

### 7.3 Lists And Wrapping
- bullet indentation
- tab stops
- wrapped-line alignment
- paragraph spacing before / after

### 7.4 Palette
- background blocks
- sidebar fill
- heading contrast
- accent lines / separators

Do not start by tuning colors if geometry and typography are still wrong.

## 8. Exit Criteria

Do not claim "pixel-perfect" or "quasi pixel-perfect" unless page 1 is defensible on these points:

- the global masses match
- sidebar width and density match
- title / label / body hierarchy matches
- bullets wrap correctly
- vertical rhythm is close
- palette and contrast are close enough that the main blocks read the same

If the proof still shows obvious block mismatch, the task is not done.

## 9. What Good Output Looks Like

For a template-clone task, produce one of these:
- a conservative patch plan tied to repo files
- a focused renderer change
- a proof-driven iteration result with explicit remaining gaps

Never hand-wave with "looks better" if the side-by-side still diverges materially.
`;
}
