import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { LlmProvider, LlmProviderConfig, ProviderId } from './types.js';

type ProviderFactory = () => Promise<LlmProvider>;

const factories = new Map<ProviderId, ProviderFactory>();
const instances = new Map<ProviderId, LlmProvider>();

export function registerProvider(id: ProviderId, factory: ProviderFactory): void {
  factories.set(id, factory);
}

async function resolve(id: ProviderId): Promise<LlmProvider> {
  const cached = instances.get(id);
  if (cached) return cached;

  const factory = factories.get(id);
  if (!factory) throw new Error(`Unknown LLM provider: ${id}`);

  const instance = await factory();
  instances.set(id, instance);
  return instance;
}

/** Return a provider by id, or the default one from LLM_PROVIDER env var */
export async function getActiveProvider(providerId?: string): Promise<LlmProvider> {
  const id = (providerId && isValidProviderId(providerId)) ? providerId : env.LLM_PROVIDER as ProviderId;
  return resolve(id);
}

/** Return config of a provider (for FinOps) */
export async function getProviderConfig(providerId?: string): Promise<LlmProviderConfig> {
  const provider = await getActiveProvider(providerId);
  return provider.config;
}

function isValidProviderId(id: string): id is ProviderId {
  return ['anthropic', 'openai', 'mistral', 'gemini', 'cohere'].includes(id);
}

/** List providers that have an API key configured, in display order */
const PROVIDER_ORDER: ProviderId[] = ['mistral', 'openai', 'anthropic', 'cohere', 'gemini'];

export function listAvailableProviders(): LlmProviderConfig[] {
  const keyMap: Record<ProviderId, string | undefined> = {
    anthropic: env.ANTHROPIC_API_KEY,
    openai: env.OPENAI_API_KEY,
    mistral: env.MISTRAL_API_KEY,
    gemini: env.GEMINI_API_KEY,
    cohere: env.COHERE_API_KEY,
  };

  return PROVIDER_ORDER
    .filter(id => keyMap[id])
    .map(id => PROVIDER_META[id]);
}

/** Static metadata — avoids instantiating providers just to list them */
const PROVIDER_META: Record<ProviderId, LlmProviderConfig> = {
  anthropic: { id: 'anthropic', modelId: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', costPer1MInput: 3, costPer1MOutput: 15, co2ePer1kOutput: 8.75 },
  openai: { id: 'openai', modelId: 'gpt-5.4-nano', label: 'GPT-5.4 Nano', costPer1MInput: 0.5, costPer1MOutput: 2, co2ePer1kOutput: 1.44 },
  mistral: { id: 'mistral', modelId: 'mistral-small-2501', label: 'Mistral Small 4', costPer1MInput: 0.1, costPer1MOutput: 0.3, co2ePer1kOutput: 0.51 },
  gemini: { id: 'gemini', modelId: 'gemini-3.1-pro-preview-customtools', label: 'Gemini 3.1 Pro', costPer1MInput: 1.25, costPer1MOutput: 10, co2ePer1kOutput: 8.10 },
  cohere: { id: 'cohere', modelId: 'command-a-reasoning-08-2025', label: 'Command A Reasoning', costPer1MInput: 2.5, costPer1MOutput: 10, co2ePer1kOutput: 20.0 },
};

// --- Auto-register providers (lazy imports) ---

registerProvider('anthropic', async () => {
  const { AnthropicProvider } = await import('./provider-anthropic.js');
  return new AnthropicProvider();
});

registerProvider('openai', async () => {
  const { OpenAIProvider } = await import('./provider-openai.js');
  return new OpenAIProvider();
});

registerProvider('mistral', async () => {
  const { MistralProvider } = await import('./provider-mistral.js');
  return new MistralProvider();
});

registerProvider('gemini', async () => {
  const { GeminiProvider } = await import('./provider-gemini.js');
  return new GeminiProvider();
});

registerProvider('cohere', async () => {
  const { CohereProvider } = await import('./provider-cohere.js');
  return new CohereProvider();
});

/** Validate at startup that the selected provider has a key */
export function validateProviderConfig(): void {
  const id = env.LLM_PROVIDER as ProviderId;
  const keyMap: Record<ProviderId, string | undefined> = {
    anthropic: env.ANTHROPIC_API_KEY,
    openai: env.OPENAI_API_KEY,
    mistral: env.MISTRAL_API_KEY,
    gemini: env.GEMINI_API_KEY,
    cohere: env.COHERE_API_KEY,
  };
  if (!keyMap[id]) {
    throw new Error(`LLM_PROVIDER is set to "${id}" but no API key is configured. Set the corresponding env var.`);
  }
  logger.info({ provider: id, model: PROVIDER_META[id].modelId }, 'LLM provider configured');
}
