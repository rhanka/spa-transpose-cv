import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an expert CV analyst. You extract structured data from CVs and return it as JSON.

Given the raw text of a CV, extract and return a JSON object with exactly this structure:

{
  "fullName": "string (or 'Candidate XXXXX' if anonymized)",
  "titleLine1": "string — primary role (e.g., 'Senior DevOps Engineer')",
  "titleLine2": "string — secondary role qualifier (e.g., 'Cloud Architect') or empty",
  "yearsExperience": "string — number only (e.g., '15')",
  "technicalSkills": [
    { "label": "string — category label ending with colon", "description": "string — descriptive text, NOT just tool lists, include (>Ny) if known" }
  ],
  "sectors": ["string — industry sectors from experience"],
  "domains": ["string — functional domains"],
  "experience": [
    {
      "company": "string — Company name, location",
      "description": "string — one-liner context",
      "dates": "string — MM/YYYY – MM/YYYY",
      "title": "string — job title",
      "tasks": ["string — action verb sentences"],
      "achievements": ["string — quantified achievements (optional, can be empty array)"],
      "techEnvironment": "string — comma-separated tech stack"
    }
  ],
  "languages": [
    { "label": "string — language name with colon", "level": "string — proficiency level" }
  ],
  "education": [
    { "year": "string — graduation year", "description": "string — degree and institution" }
  ]
}

CRITICAL RULES:
- technicalSkills: 5-7 items. Each description must be DESCRIPTIVE (what the person DOES with the tech), NOT just a comma-separated tool list.
- sectors: 3-5 items extracted from work experience industries.
- domains: 3-5 functional domains.
- experience: reverse chronological order (most recent first). 3-6 tasks per role, action verbs.
- education: reverse chronological order (most recent first).
- For careers >20 years: detail last 10 years, consolidate the rest.
- Use en-dash (–) for date ranges, not hyphens.
- Return ONLY valid JSON. No markdown, no code fences, no explanation.`;

export interface CvData {
  fullName: string;
  titleLine1: string;
  titleLine2: string;
  yearsExperience: string;
  technicalSkills: { label: string; description: string }[];
  sectors: string[];
  domains: string[];
  experience: {
    company: string;
    description: string;
    dates: string;
    title: string;
    tasks: string[];
    achievements: string[];
    techEnvironment: string;
  }[];
  languages: { label: string; level: string }[];
  education: { year: string; description: string }[];
}

export async function extractCvData(cvText: string, userPrompt: string): Promise<CvData> {
  const userMessage = userPrompt
    ? `${userPrompt}\n\n---\n\nCV TEXT:\n${cvText}`
    : `CV TEXT:\n${cvText}`;

  logger.info({ textLength: cvText.length }, 'Calling Claude API for CV extraction');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');

  // Parse JSON — handle potential code fences
  const jsonStr = text.replace(/^```json?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();

  try {
    return JSON.parse(jsonStr) as CvData;
  } catch (err) {
    logger.error({ text: text.substring(0, 500) }, 'Failed to parse Claude response as JSON');
    throw new Error(`Claude returned invalid JSON: ${(err as Error).message}`);
  }
}
