import { CohereClient } from 'cohere-ai';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { LlmProvider, LlmProviderConfig, LlmRequest, LlmResponse, LlmStreamCallbacks } from './types.js';

export class CohereProvider implements LlmProvider {
  readonly config: LlmProviderConfig = {
    id: 'cohere',
    modelId: 'command-a-reasoning-08-2025',
    label: 'Command A Reasoning',
    costPer1MInput: 2.5,
    costPer1MOutput: 10,
  };

  private static MAX_TOKENS = 8192;
  private client: CohereClient;

  constructor() {
    this.client = new CohereClient({ token: env.COHERE_API_KEY });
  }

  private clampTokens(requested: number): number {
    return Math.min(requested, CohereProvider.MAX_TOKENS);
  }

  async generate(req: LlmRequest): Promise<LlmResponse> {
    const response = await this.client.v2.chat({
      model: this.config.modelId,
      maxTokens: this.clampTokens(req.maxTokens),
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.userMessage },
      ],
    });

    const firstBlock = response.message?.content?.[0] as Record<string, unknown> | undefined;
    const text = (firstBlock?.text as string) || '';
    return {
      text,
      usage: {
        input_tokens: response.usage?.tokens?.inputTokens || 0,
        output_tokens: response.usage?.tokens?.outputTokens || 0,
      },
    };
  }

  async generateStream(req: LlmRequest, cb: LlmStreamCallbacks): Promise<LlmResponse> {
    const stream = await this.client.v2.chatStream({
      model: this.config.modelId,
      maxTokens: this.clampTokens(req.maxTokens),
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.userMessage },
      ],
    });

    let fullText = '';
    let usage = { input_tokens: 0, output_tokens: 0 };

    let debugLogged = false;
    for await (const event of stream) {
      const eventType = (event as unknown as Record<string, unknown>).type as string;

      if (!debugLogged && (eventType === 'content-delta' || eventType === 'tool-plan-delta')) {
        logger.info({ cohereEvent: JSON.stringify(event).slice(0, 500) }, `Cohere first stream event: ${eventType}`);
        debugLogged = true;
      }

      if (eventType === 'content-delta') {
        // Cohere reasoning model: thinking blocks use `thinking` key, text blocks use `text` key
        const deltaObj = (event as unknown as Record<string, unknown>).delta as Record<string, unknown> | undefined;
        const msgObj = deltaObj?.message as Record<string, unknown> | undefined;
        const contentObj = msgObj?.content as Record<string, unknown> | undefined;

        const thinking = typeof contentObj?.thinking === 'string' ? contentObj.thinking : undefined;
        const text = typeof contentObj?.text === 'string' ? contentObj.text : undefined;

        if (thinking) {
          cb.onThinking?.(thinking);
        } else if (text) {
          fullText += text;
          cb.onContent?.(text);
        }
      } else if (eventType === 'tool-plan-delta') {
        // Cohere reasoning via tool plan
        const deltaObj = (event as unknown as Record<string, unknown>).delta as Record<string, unknown> | undefined;
        const msgObj = deltaObj?.message as Record<string, unknown> | undefined;
        const toolPlan = typeof msgObj?.toolPlan === 'string' ? msgObj.toolPlan : undefined;
        if (toolPlan) {
          cb.onThinking?.(toolPlan);
        }
      } else if (eventType === 'message-end') {
        const evt = event as unknown as Record<string, unknown>;
        const delta = evt.delta as Record<string, unknown> | undefined;
        const u = delta?.usage as Record<string, Record<string, number>> | undefined;
        if (u?.tokens) {
          usage.input_tokens = u.tokens.inputTokens || 0;
          usage.output_tokens = u.tokens.outputTokens || 0;
        }
      }
    }

    return { text: fullText, usage };
  }
}
