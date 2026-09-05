import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import type { LlmProvider, LlmProviderConfig, LlmRequest, LlmResponse, LlmStreamCallbacks } from './types.js';

type ReasoningEffort = 'low' | 'medium' | 'high';

// Map the legacy numeric reasoning budget to the adaptive-thinking effort tier.
function reasoningEffort(budget?: number): ReasoningEffort {
  if (budget === undefined) return 'low';
  if (budget <= 4096) return 'low';
  if (budget <= 12288) return 'medium';
  return 'high';
}

export class AnthropicProvider implements LlmProvider {
  readonly config: LlmProviderConfig = {
    id: 'anthropic',
    modelId: 'claude-sonnet-5',
    label: 'Claude Sonnet 5',
    costPer1MInput: 3,
    costPer1MOutput: 15,
    co2ePer1kOutput: 8.75,
  };

  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }

  async generate(req: LlmRequest): Promise<LlmResponse> {
    const params: Anthropic.MessageCreateParams = {
      model: this.config.modelId,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: 'user', content: req.userMessage }],
    };
    if (req.enableReasoning) {
      // Claude Sonnet 5+ replaced budget-based thinking with adaptive thinking
      // controlled via output_config.effort. The old {type:'enabled',budget_tokens}
      // is rejected (400) by the newer models.
      (params as unknown as Record<string, unknown>).thinking = { type: 'adaptive' };
      (params as unknown as Record<string, unknown>).output_config = {
        effort: reasoningEffort(req.reasoningBudget),
      };
    }

    const response = await this.client.messages.create(params);
    let text = '';
    for (const block of response.content) {
      if (block.type === 'text') text += block.text;
    }
    return {
      text,
      usage: {
        input_tokens: response.usage?.input_tokens || 0,
        output_tokens: response.usage?.output_tokens || 0,
      },
    };
  }

  async generateStream(req: LlmRequest, cb: LlmStreamCallbacks): Promise<LlmResponse> {
    const params: Anthropic.MessageCreateParams = {
      model: this.config.modelId,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: 'user', content: req.userMessage }],
      stream: true,
    };
    if (req.enableReasoning) {
      // Claude Sonnet 5+ replaced budget-based thinking with adaptive thinking
      // controlled via output_config.effort. The old {type:'enabled',budget_tokens}
      // is rejected (400) by the newer models.
      (params as unknown as Record<string, unknown>).thinking = { type: 'adaptive' };
      (params as unknown as Record<string, unknown>).output_config = {
        effort: reasoningEffort(req.reasoningBudget),
      };
    }

    const stream = await this.client.messages.create(params);
    let fullText = '';
    let usage = { input_tokens: 0, output_tokens: 0 };

    for await (const event of stream as AsyncIterable<Record<string, unknown>>) {
      if (event.type === 'content_block_delta') {
        const delta = event.delta as Record<string, unknown>;
        if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
          cb.onThinking?.(delta.thinking);
        } else if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          fullText += delta.text;
          cb.onContent?.(delta.text);
        }
      } else if (event.type === 'message_delta') {
        const u = (event as Record<string, unknown>).usage as Record<string, number> | undefined;
        if (u) usage.output_tokens = u.output_tokens || 0;
      } else if (event.type === 'message_start') {
        const msg = (event as Record<string, { usage?: Record<string, number> }>).message;
        if (msg?.usage) usage.input_tokens = msg.usage.input_tokens || 0;
      }
    }

    return { text: fullText, usage };
  }
}
