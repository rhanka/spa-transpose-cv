import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { LlmProvider, LlmProviderConfig, LlmRequest, LlmResponse, LlmStreamCallbacks } from './types.js';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export class GeminiProvider implements LlmProvider {
  readonly config: LlmProviderConfig = {
    id: 'gemini',
    modelId: 'gemini-3.1-pro-preview-customtools',
    label: 'Gemini 3.1 Pro',
    costPer1MInput: 1.25,
    costPer1MOutput: 10,
  };

  private apiKey: string;

  constructor() {
    this.apiKey = env.GEMINI_API_KEY!;
  }

  private buildBody(req: LlmRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts: [{ text: req.userMessage }] }],
      generationConfig: {
        maxOutputTokens: req.maxTokens,
      },
    };
    if (req.enableReasoning) {
      (body.generationConfig as Record<string, unknown>).thinkingConfig = {
        thinkingBudget: req.reasoningBudget ?? 8192,
        includeThoughts: true,
      };
    }
    return body;
  }

  async generate(req: LlmRequest): Promise<LlmResponse> {
    const url = `${BASE_URL}/models/${this.config.modelId}:generateContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.buildBody(req)),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${errText}`);
    }

    const json = await res.json() as Record<string, unknown>;
    const candidates = (json.candidates as Record<string, unknown>[]) || [];
    const parts = (candidates[0]?.content as Record<string, unknown>)?.parts as Record<string, unknown>[] || [];

    let text = '';
    for (const part of parts) {
      if (typeof part.text === 'string' && !part.thought) text += part.text;
    }

    const meta = json.usageMetadata as Record<string, number> | undefined;
    return {
      text,
      usage: {
        input_tokens: meta?.promptTokenCount || 0,
        output_tokens: (meta?.candidatesTokenCount || 0) + (meta?.thoughtsTokenCount || 0),
      },
    };
  }

  async generateStream(req: LlmRequest, cb: LlmStreamCallbacks): Promise<LlmResponse> {
    const url = `${BASE_URL}/models/${this.config.modelId}:streamGenerateContent?alt=sse&key=${this.apiKey}`;
    const body = this.buildBody(req);
    // Note: Gemini thinks internally (thoughtsTokenCount > 0) but does NOT expose
    // thought text in stream parts — only a thoughtSignature blob. This is an API limitation.

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${errText}`);
    }

    let fullText = '';
    let usage = { input_tokens: 0, output_tokens: 0 };
    let debugLogged = false;

    // Parse SSE stream
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

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
          const candidates = (chunk.candidates as Record<string, unknown>[]) || [];
          const parts = (candidates[0]?.content as Record<string, unknown>)?.parts as Record<string, unknown>[] || [];

          if (!debugLogged && parts.length > 0) {
            logger.info({ geminiPart: JSON.stringify(parts[0]).slice(0, 500) }, 'Gemini first stream part');
            debugLogged = true;
          }

          for (const part of parts) {
            if (typeof part.text === 'string') {
              if (part.thought) {
                cb.onThinking?.(part.text);
              } else {
                fullText += part.text;
                cb.onContent?.(part.text);
              }
            }
          }

          const meta = chunk.usageMetadata as Record<string, number> | undefined;
          if (meta) {
            usage.input_tokens = meta.promptTokenCount || 0;
            usage.output_tokens = (meta.candidatesTokenCount || 0) + (meta.thoughtsTokenCount || 0);
          }
        } catch { /* skip malformed SSE line */ }
      }
    }

    return { text: fullText, usage };
  }
}
