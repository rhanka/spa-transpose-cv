import { z } from 'zod';

/**
 * Structured CV profile produced by the LLM extraction agent.
 *
 * Lives in `@cv-transpose/core` (rather than next to the api-side extractor)
 * because pure-data consumers — notably the template contract validator — need
 * to reference this shape without dragging in api-only modules (logger, llm
 * client, etc.). The api-side `cv-agent.ts` re-exports these symbols so older
 * imports keep working.
 */
export const cvDataSchema = z.object({
  name: z.string().trim().min(1),
  title_line1: z.string(),
  title_line2: z.string(),
  years: z.string(),
  technicalSkills: z.array(z.object({
    label: z.string().trim().min(1),
    description: z.string().trim().min(1),
  })),
  sectors: z.array(z.string().trim().min(1)),
  domains: z.array(z.string().trim().min(1)),
  experience: z.array(z.object({
    company: z.string().trim().min(1),
    description: z.string().trim().min(1),
    dates: z.string().trim().min(1),
    title: z.string().trim().min(1),
    tasks: z.array(z.string().trim().min(1)),
    achievements: z.array(z.string().trim()),
    techEnvironment: z.string().trim(),
  })),
  languages: z.array(z.object({
    label: z.string().trim().min(1),
    level: z.string().trim().min(1),
  })),
  education: z.array(z.object({
    year: z.string().trim().min(1),
    description: z.string().trim().min(1),
  })),
  attention_cv: z.string(),
});

export type CvData = z.infer<typeof cvDataSchema>;
