import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an expert CV analyst for Scalian, a tech consultancy. You extract structured data from CVs and return it as JSON.

FIDELITY RULE — CRITICAL:
- NEVER invent content. All information (skills, positions, tasks, achievements, education, languages) MUST come from the CV source.
- Reformulating and synthesizing is OK and encouraged. Inventing facts, figures, or achievements is NOT.
- Technical skill bullets are a thematic synthesis of the entire career — this is the ONLY section where you "interpret" rather than transcribe.
- Achievements: map ONLY those present in the source CV. If a position has no achievements mentioned, return achievements=[]. Do NOT fabricate them.
- Certifications, dates, company names: reproduce faithfully. Do not guess dates.

Given the raw text of a CV, extract and return a JSON object with exactly this structure:

{
  "name": "string — full name (or 'Candidate XXXXX' if anonymized)",
  "title_line1": "string — primary role, MAX 25 CHARACTERS (e.g., 'IT Leader', 'DevOps Engineer')",
  "title_line2": "string — secondary qualifier, MAX 25 CHARACTERS (e.g., 'Cloud Architect', 'SRE') or empty string",
  "years": "string — number only (e.g., '15')",
  "technicalSkills": [
    { "label": "string — category label ending with colon", "description": "string — DESCRIPTIVE text about what the person DOES, NOT just a comma-separated tool list. Include (>Ny) if experience duration is known." }
  ],
  "sectors": ["string — industry sectors from experience"],
  "domains": ["string — functional domains"],
  "experience": [
    {
      "company": "string — Company name, location (use en-dash for separators)",
      "description": "string — one-liner context",
      "dates": "string — MM/YYYY – MM/YYYY (en-dash, not hyphen)",
      "title": "string — job title",
      "tasks": ["string — action verb sentences, 3-6 per role"],
      "achievements": ["string — quantified, ONLY from source CV. Empty array [] if none mentioned."],
      "techEnvironment": "string — comma-separated tech stack"
    }
  ],
  "languages": [
    { "label": "string — language name with colon (e.g., 'English:')", "level": "string — proficiency level" }
  ],
  "education": [
    { "year": "string — graduation year", "description": "string — degree and institution (use en-dash)" }
  ],
  "attention_cv": "string — Concise markdown bullet points (use actual newlines between bullets, not inline). Each bullet starts with **bold keyword** then short sentence. Focus only on what a recruiter must know: missing data, inconsistencies, profile type. No filler. Example format:\n- **Anonymized** — ID 138282, no personal info\n- **No certifications** — despite 10y cloud experience\n- **Career gap** — 6 months between roles in 2022"
}

CONSTRAINTS:
- title_line1: MAXIMUM 25 characters. If your title is longer, shorten it.
- title_line2: MAXIMUM 25 characters. Can be empty string "".
- technicalSkills: 5-7 items. Each description must be DESCRIPTIVE, NOT just tool lists. MAX 130 CHARACTERS per description (keep it to ~1.5 printed lines). Be concise.
  BAD: "AWS, Azure, GCP, Terraform, Ansible (>5y)"
  GOOD: "Defining cloud infrastructure and migration strategies for enterprise workloads (>5y)"
  BAD (too long): "Multi-distribution Linux administration (RHEL 5-9, CentOS, Rocky Linux, Oracle Linux) across enterprise, banking, and cloud environments, including patching, LVM/filesystem management (>10y)"
  GOOD (concise): "Enterprise Linux administration (RHEL, CentOS, Rocky) including patching, LVM, and L3 support (>10y)"
- sectors: 3-5 items extracted from work experience industries.
- domains: 3-5 functional domains.
- experience: reverse chronological order (most recent first). 3-6 tasks per role, action verbs.
- education: reverse chronological order (most recent first).
- For careers >20 years: detail last 10 years, consolidate the rest.
- Use en-dash (–) for date ranges, not hyphens.
- Return ONLY valid JSON. No markdown, no code fences, no explanation.`;

export interface CvData {
  name: string;
  title_line1: string;
  title_line2: string;
  years: string;
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
  attention_cv: string;
}

export interface StreamCallbacks {
  onThinking?: (delta: string) => void;
  onContent?: (delta: string) => void;
}

export async function extractCvData(
  cvText: string,
  userPrompt: string,
  sourceFileName: string,
  callbacks?: StreamCallbacks,
): Promise<CvData> {
  const userMessage = [
    userPrompt ? userPrompt : '',
    `SOURCE FILENAME: ${sourceFileName}`,
    'If the CV is anonymized (no real name), use "Candidate XXXXX" where XXXXX is the numeric ID from the filename (e.g., SCALO_DevOps_138282.pdf → "Candidate 138282").',
    '---',
    `CV TEXT:\n${cvText}`,
  ].filter(Boolean).join('\n\n');

  logger.info({ textLength: cvText.length }, 'Calling Claude API for CV extraction');

  let fullText = '';

  if (callbacks) {
    // Streaming mode: use stream API for live updates
    const stream = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      thinking: { type: 'enabled', budget_tokens: 4096 },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      stream: true,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const delta = event.delta as unknown as Record<string, unknown>;
        if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
          callbacks.onThinking?.(delta.thinking);
        } else if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          fullText += delta.text;
          callbacks.onContent?.(delta.text);
        }
      }
    }
  } else {
    // Non-streaming mode
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      thinking: { type: 'enabled', budget_tokens: 4096 },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    for (const block of response.content) {
      if (block.type === 'text') fullText += block.text;
    }
  }

  // Parse JSON — handle potential code fences
  const jsonStr = fullText.replace(/^```json?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();

  try {
    const data = JSON.parse(jsonStr) as CvData;
    // Validate header constraints
    if (data.title_line1.length > 25) {
      throw new Error(`title_line1 too long (${data.title_line1.length} chars, max 25): "${data.title_line1}"`);
    }
    if (data.title_line2.length > 25) {
      throw new Error(`title_line2 too long (${data.title_line2.length} chars, max 25): "${data.title_line2}"`);
    }
    return data;
  } catch (err) {
    logger.error({ text: fullText.substring(0, 500) }, 'Failed to parse Claude response');
    throw new Error(`Claude extraction error: ${(err as Error).message}`);
  }
}

/**
 * Retry extraction with error feedback
 */
export async function extractCvDataWithRetry(
  cvText: string,
  userPrompt: string,
  sourceFileName: string,
  callbacks?: StreamCallbacks,
): Promise<CvData> {
  try {
    return await extractCvData(cvText, userPrompt, sourceFileName, callbacks);
  } catch (firstError) {
    logger.info({ error: (firstError as Error).message }, 'First extraction failed, retrying with error feedback');
    callbacks?.onThinking?.(`\n[RETRY] First attempt failed: ${(firstError as Error).message}\n`);

    const retryPrompt = userPrompt
      ? `${userPrompt}\n\nPREVIOUS ATTEMPT FAILED WITH ERROR: ${(firstError as Error).message}\nPlease fix and return valid JSON.`
      : `PREVIOUS ATTEMPT FAILED WITH ERROR: ${(firstError as Error).message}\nPlease fix and return valid JSON.`;

    return await extractCvData(cvText, retryPrompt, sourceFileName, callbacks);
  }
}
