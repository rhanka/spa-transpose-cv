export type ProviderId = 'anthropic' | 'openai' | 'mistral' | 'gemini' | 'cohere';

export interface LlmRequest {
  system: string;
  userMessage: string;
  maxTokens: number;
  /** Enable extended thinking / reasoning if the provider supports it */
  enableReasoning?: boolean;
  /** Token budget for reasoning (provider-specific mapping) */
  reasoningBudget?: number;
}

export interface LlmResponse {
  text: string;
  usage: TokenUsage;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface LlmStreamCallbacks {
  onThinking?: (delta: string) => void;
  onContent?: (delta: string) => void;
}

export interface LlmProviderConfig {
  id: ProviderId;
  modelId: string;
  label: string;
  /** USD per 1M input tokens */
  costPer1MInput: number;
  /** USD per 1M output tokens */
  costPer1MOutput: number;
  /** Estimated gCO2e per 1k output tokens (see CO2_METHODOLOGY.md) */
  co2ePer1kOutput: number;
}

export interface LlmProvider {
  readonly config: LlmProviderConfig;
  /** Non-streaming generation */
  generate(req: LlmRequest): Promise<LlmResponse>;
  /** Streaming generation with thinking/content callbacks */
  generateStream(req: LlmRequest, cb: LlmStreamCallbacks): Promise<LlmResponse>;
}
