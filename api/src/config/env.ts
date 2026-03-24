import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PORT: z.coerce.number().default(8686),
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  SESSION_MAX_AGE_HOURS: z.coerce.number().default(48),
  MAX_CONCURRENT_AGENTS: z.coerce.number().default(10),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().default(50),
  DATA_DIR: z.string().default('/data'),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
