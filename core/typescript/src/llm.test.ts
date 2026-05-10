import { describe, it, expect } from 'vitest';
import type { LlmProvider } from './llm.js';

describe('LlmProvider', () => {
  it('a mock provider can be passed where LlmProvider is expected', async () => {
    const mock: LlmProvider = {
      complete: async () => ({ text: 'hello', usage: { inputTokens: 1, outputTokens: 1 } })
    };
    const r = await mock.complete({ systemPrompt: 's', userPrompt: 'u' });
    expect(r.text).toBe('hello');
  });
});
