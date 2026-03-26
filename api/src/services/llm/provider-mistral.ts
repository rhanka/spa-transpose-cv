import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { LlmProvider, LlmProviderConfig, LlmRequest, LlmResponse, LlmStreamCallbacks } from './types.js';

const BASE_URL = 'https://api.mistral.ai/v1';

export class MistralProvider implements LlmProvider {
  readonly config: LlmProviderConfig = {
    id: 'mistral',
    modelId: 'mistral-small-2501',
    label: 'Mistral Small 4',
    costPer1MInput: 0.1,
    costPer1MOutput: 0.3,
  };

  private apiKey: string;

  constructor() {
    this.apiKey = env.MISTRAL_API_KEY!;
  }

  private buildBody(req: LlmRequest, stream: boolean): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.config.modelId,
      max_tokens: req.maxTokens,
      stream,
      ...(stream ? { stream_options: { include_usage: true } } : {}),
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.userMessage },
      ],
    };
    if (req.enableReasoning) {
      body.reasoning_effort = 'high';
    }
    return body;
  }

  async generate(req: LlmRequest): Promise<LlmResponse> {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(this.buildBody(req, false)),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Mistral API error ${res.status}: ${errText}`);
    }

    const json = await res.json() as Record<string, unknown>;
    const choices = (json.choices as Array<Record<string, unknown>>) || [];
    const message = choices[0]?.message as Record<string, unknown> | undefined;

    // Extract text content (skip thinking blocks)
    let text = '';
    if (typeof message?.content === 'string') {
      text = message.content;
    } else if (Array.isArray(message?.content)) {
      for (const chunk of message.content as Array<Record<string, unknown>>) {
        if (chunk.type === 'text' && typeof chunk.text === 'string') {
          text += chunk.text;
        }
      }
    }

    const usage = json.usage as Record<string, number> | undefined;
    return {
      text,
      usage: {
        input_tokens: usage?.prompt_tokens || 0,
        output_tokens: usage?.completion_tokens || 0,
      },
    };
  }

  async generateStream(req: LlmRequest, cb: LlmStreamCallbacks): Promise<LlmResponse> {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(this.buildBody(req, true)),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Mistral API error ${res.status}: ${errText}`);
    }

    let fullText = '';
    let usage = { input_tokens: 0, output_tokens: 0 };

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let debugLogged = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (!payload || payload === '[DONE]') continue;

        try {
          const chunk = JSON.parse(payload) as Record<string, unknown>;
          const choices = (chunk.choices as Array<Record<string, unknown>>) || [];
          const delta = choices[0]?.delta as Record<string, unknown> | undefined;
          if (!delta) continue;

          if (!debugLogged) {
            logger.info({ mistralDelta: JSON.stringify(delta).slice(0, 500) }, 'Mistral first stream delta (raw HTTP)');
            debugLogged = true;
          }

          // Mistral thinking: content can be array of {type:"thinking"}/{type:"text"} chunks
          if (Array.isArray(delta.content)) {
            for (const part of delta.content as Array<Record<string, unknown>>) {
              if (part.type === 'thinking') {
                // Thinking parts: {type:"thinking", thinking:[{type:"text", text:"..."}]}
                const thinkingParts = Array.isArray(part.thinking) ? part.thinking as Array<Record<string, unknown>> : [];
                for (const tp of thinkingParts) {
                  if (typeof tp.text === 'string' && tp.text) {
                    cb.onThinking?.(tp.text);
                  }
                }
              } else if (part.type === 'text') {
                if (typeof part.text === 'string' && part.text) {
                  fullText += part.text;
                  cb.onContent?.(part.text);
                }
              }
            }
          } else if (typeof delta.content === 'string' && delta.content) {
            fullText += delta.content;
            cb.onContent?.(delta.content);
          }

          // Fallback: reasoning_content field
          if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
            cb.onThinking?.(delta.reasoning_content);
          }

          if (chunk.usage) {
            const u = chunk.usage as Record<string, number>;
            usage.input_tokens = u.prompt_tokens || 0;
            usage.output_tokens = u.completion_tokens || 0;
          }
        } catch { /* skip malformed SSE line */ }
      }
    }

    return { text: fullText, usage };
  }
}
