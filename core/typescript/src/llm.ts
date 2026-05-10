export interface LlmCompleteArgs {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmCompleteResult {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface LlmProvider {
  complete(args: LlmCompleteArgs): Promise<LlmCompleteResult>;
}
