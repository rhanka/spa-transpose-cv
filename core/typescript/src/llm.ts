export interface LlmCompleteArgs {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  /** Enable extended thinking when the provider supports it. */
  enableReasoning?: boolean;
  /** Thinking-budget tokens. Honored only when enableReasoning is true. */
  reasoningBudget?: number;
  /** Prefer provider-native structured JSON output when supported. */
  responseFormat?: 'json';
  /** Optional streaming hook. When provided, the provider should call this with
   *  each delta. The final return value still carries the full text + usage. */
  onDelta?: (delta: { kind: 'thinking' | 'content'; text: string }) => void;
}

export interface LlmCompleteResult {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface LlmProvider {
  complete(args: LlmCompleteArgs): Promise<LlmCompleteResult>;
}
