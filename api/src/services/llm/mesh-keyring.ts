import {
  EncryptedFileKeyring,
  EnvKeyring,
  type KeyringAdapter,
} from '@sentropic/llm-mesh/node';
import type { ProviderId } from './types.js';

export const PROVIDER_SECRET_KEYS: Record<ProviderId, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  gemini: 'GEMINI_API_KEY',
  cohere: 'COHERE_API_KEY',
};

export function createMeshKeyring(): KeyringAdapter {
  // llm-mesh 0.19 expects a directory containing encrypted records and .key,
  // despite the LLM_KEYRING_FILE variable name. No OS secret store is needed.
  const directory = process.env.LLM_KEYRING_FILE;
  return directory ? new EncryptedFileKeyring(directory) : new EnvKeyring('');
}
