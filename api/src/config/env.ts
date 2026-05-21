import { z } from 'zod';

const envBoolean = z.union([z.boolean(), z.string()]).transform((value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off', ''].includes(normalized)) {
    return false;
  }
  throw new Error(`Invalid boolean value "${value}"`);
});

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PORT: z.coerce.number().default(8686),
  LLM_PROVIDER: z.enum(['anthropic', 'openai', 'mistral', 'gemini', 'cohere']).default('mistral'),
  /** Opt-in: route LLM calls through the @sentropic/llm-mesh facade (Sentropic
   * integration spike). When false (default), the concrete provider is used
   * directly with no behavior change. */
  LLM_MESH: envBoolean.default(false),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  COHERE_API_KEY: z.string().optional(),
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  SESSION_MAX_AGE_HOURS: z.coerce.number().default(48),
  MAX_CONCURRENT_AGENTS: z.coerce.number().default(10),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().default(50),
  DATA_DIR: z.string().default('/data'),
  TENANT_STORAGE_BACKEND: z.enum(['local', 's3']).default('local'),
  TENANT_S3_BUCKET: z.string().optional(),
  TENANT_S3_REGION: z.string().default('fr-par'),
  TENANT_S3_ENDPOINT: z.string().url().default('https://s3.fr-par.scw.cloud'),
  TENANT_S3_ACCESS_KEY: z.string().optional(),
  TENANT_S3_SECRET_KEY: z.string().optional(),
  TENANT_S3_PREFIX: z.string().default(''),
  ADMIN_PASSWORD_HASH: z.string().optional(),
  ADMIN_PASSWORD_SALT: z.string().optional(),
  ADMIN_SEED_SECRET: z.string().optional(),
  ADMIN_TOKEN_TTL_MINUTES: z.coerce.number().default(720),
  ADMIN_OTP_TTL_MINUTES: z.coerce.number().default(15),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_SECURE: envBoolean.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
