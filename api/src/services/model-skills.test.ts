import assert from 'node:assert/strict';
import test from 'node:test';
import { composeSystemPromptWithSkills, getModelSkill, listModelSkills } from './model-skills/index.js';
import { getTemplateGenerationSystemPrompt } from './template-generation-prompt.js';

test('lists the embedded DOCX template clone skill', () => {
  const skills = listModelSkills();
  assert.equal(skills.length, 1);
  assert.equal(skills[0]?.id, 'docx-template-clone');
  assert.equal(skills[0]?.target, 'embedded-model');
});

test('returns the DOCX template clone skill content', () => {
  const skill = getModelSkill('docx-template-clone');
  assert.match(skill.content, /DOCX Template Clone Skill/i);
  assert.match(skill.content, /TypeScript only/i);
  assert.match(skill.content, /template\/render\.ts/i);
});

test('composes a system prompt with deduplicated skills', () => {
  const prompt = composeSystemPromptWithSkills('Base prompt', ['docx-template-clone', 'docx-template-clone']);
  assert.match(prompt, /^Base prompt/);
  assert.equal((prompt.match(/Embedded Skill: DOCX Template Clone/g) ?? []).length, 1);
});

test('builds the template generation prompt with the embedded DOCX skill', () => {
  const prompt = getTemplateGenerationSystemPrompt();
  assert.match(prompt, /embedded DOCX template generation agent/i);
  assert.match(prompt, /Embedded Skill: DOCX Template Clone/);
  assert.match(prompt, /proof-driven TypeScript \+ OOXML workflow/i);
});
