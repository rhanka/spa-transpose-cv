import OpenAI from 'openai';
import { env } from '../../config/env.js';
import type { LlmProvider, LlmProviderConfig, LlmRequest, LlmResponse, LlmStreamCallbacks } from './types.js';

export class OpenAIProvider implements LlmProvider {
  readonly config: LlmProviderConfig = {
    id: 'openai',
    modelId: 'gpt-5.4-nano',
    label: 'GPT-5.4 Nano',
    costPer1MInput: 0.5,
    costPer1MOutput: 2,
  };

  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  async generate(req: LlmRequest): Promise<LlmResponse> {
    // Use Responses API for reasoning support
    const params: Record<string, unknown> = {
      model: this.config.modelId,
      max_output_tokens: req.maxTokens,
      instructions: req.system,
      input: req.userMessage,
    };
    if (req.enableReasoning) {
      params.reasoning = { effort: 'medium', summary: 'detailed' };
    }

    const response = await (this.client as unknown as { responses: { create: (p: unknown) => Promise<Record<string, unknown>> } })
      .responses.create(params);

    // Extract text from output array
    let text = '';
    const output = response.output as Array<Record<string, unknown>> | undefined;
    if (output) {
      for (const item of output) {
        if (item.type === 'message') {
          const content = item.content as Array<Record<string, unknown>> | undefined;
          if (content) {
            for (const block of content) {
              if (block.type === 'output_text' && typeof block.text === 'string') {
                text += block.text;
              }
            }
          }
        }
      }
    }

    const u = response.usage as Record<string, unknown> | undefined;
    let outTokens = (u?.output_tokens as number) || 0;
    const details = u?.output_tokens_details as Record<string, number> | undefined;
    if (details?.reasoning_tokens) outTokens += details.reasoning_tokens;
    return {
      text,
      usage: {
        input_tokens: (u?.input_tokens as number) || 0,
        output_tokens: outTokens,
      },
    };
  }

  async generateStream(req: LlmRequest, cb: LlmStreamCallbacks): Promise<LlmResponse> {
    // Use Responses API with streaming for reasoning deltas
    const params: Record<string, unknown> = {
      model: this.config.modelId,
      max_output_tokens: req.maxTokens,
      instructions: req.system,
      input: req.userMessage,
      stream: true,
    };
    if (req.enableReasoning) {
      params.reasoning = { effort: 'medium', summary: 'detailed' };
    }

    const stream = await (this.client as unknown as { responses: { create: (p: unknown) => Promise<AsyncIterable<Record<string, unknown>>> } })
      .responses.create(params);

    let fullText = '';
    let usage = { input_tokens: 0, output_tokens: 0 };

    for await (const event of stream) {
      const eventType = typeof event.type === 'string' ? event.type : '';

      switch (eventType) {
        // Reasoning deltas
        case 'response.reasoning_text.delta':
        case 'response.reasoning.delta': {
          const delta = typeof event.delta === 'string' ? event.delta : (typeof event.text === 'string' ? event.text : undefined);
          if (delta) cb.onThinking?.(delta);
          break;
        }
        case 'response.reasoning_summary_text.delta':
        case 'response.reasoning_summary.delta': {
          const delta = typeof event.delta === 'string' ? event.delta : undefined;
          if (delta) cb.onThinking?.(delta);
          break;
        }

        // Content deltas
        case 'response.output_text.delta': {
          const delta = typeof event.delta === 'string' ? event.delta : undefined;
          if (delta) {
            fullText += delta;
            cb.onContent?.(delta);
          }
          break;
        }

        // Usage (at completion) — include reasoning tokens
        case 'response.completed': {
          const resp = event.response as Record<string, unknown> | undefined;
          const u = resp?.usage as Record<string, unknown> | undefined;
          if (u) {
            usage.input_tokens = (u.input_tokens as number) || 0;
            usage.output_tokens = (u.output_tokens as number) || 0;
            // Reasoning tokens are separate in the Responses API
            const details = u.output_tokens_details as Record<string, number> | undefined;
            if (details?.reasoning_tokens) {
              usage.output_tokens += details.reasoning_tokens;
            }
          }
          break;
        }
      }
    }

    return { text: fullText, usage };
  }
}
