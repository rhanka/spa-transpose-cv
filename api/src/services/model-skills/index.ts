import { getDocxTemplateCloneSkill } from './docx-template-clone-skill.js';

export type ModelSkillId = 'docx-template-clone';

export interface ModelSkill {
  id: ModelSkillId;
  label: string;
  target: 'embedded-model';
  summary: string;
  content: string;
}

const MODEL_SKILLS: Record<ModelSkillId, ModelSkill> = {
  'docx-template-clone': {
    id: 'docx-template-clone',
    label: 'DOCX Template Clone',
    target: 'embedded-model',
    summary: 'Clone or adapt a supplier DOCX template with a proof-driven TypeScript + OOXML workflow.',
    content: getDocxTemplateCloneSkill(),
  },
};

export function getModelSkill(skillId: ModelSkillId): ModelSkill {
  return MODEL_SKILLS[skillId];
}

export function listModelSkills(): ModelSkill[] {
  return Object.values(MODEL_SKILLS);
}

export function composeSystemPromptWithSkills(baseSystemPrompt: string, skillIds: ModelSkillId[]): string {
  const base = baseSystemPrompt.trim();
  const uniqueSkills = [...new Set(skillIds)].map((skillId) => getModelSkill(skillId));

  if (uniqueSkills.length === 0) {
    return base;
  }

  const skillSections = uniqueSkills.map((skill) => [
    `## Embedded Skill: ${skill.label}`,
    skill.content.trim(),
  ].join('\n\n'));

  return [
    base,
    ...skillSections,
  ].filter(Boolean).join('\n\n');
}
