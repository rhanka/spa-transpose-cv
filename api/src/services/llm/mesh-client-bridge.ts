/**
 * Bridge: expose a local `LlmProvider` (api/src/services/llm/types.ts) as a
 * `@sentropic/llm-mesh` `ProviderAdapterClient`.
 *
 * Purpose: let the mesh's injected-client contract delegate generation/stream
 * calls back to the existing provider SDK implementations without removing
 * them. Used by `mesh-adapter.ts`.
 *
 * Scope (first increment): single (system + user) message pair only — multi-
 * turn conversations and tool messages are not yet exercised by the API.
 */

import type {
  GenerateRequest,
  GenerateResponse,
  LlmMeshMessage,
  ProviderAdapterClient,
  StreamEvent,
  StreamRequest,
  StreamResult,
} from '@sentropic/llm-mesh';
import type {
  LlmProvider,
  LlmProviderConfig,
  LlmRequest,
  LlmResponse,
} from './types.js';

const DEFAULT_MAX_TOKENS = 16_000;

export function meshRequestToLocalRequest(req: GenerateRequest): LlmRequest {
  const system = extractSingleRoleText(req.messages, 'system');
  const userMessage = extractSingleRoleText(req.messages, 'user');
  if (system === null || userMessage === null) {
    throw new Error(
      'mesh-client-bridge only supports a single system + user message pair',
    );
  }
  const providerOptions = (req.providerOptions ?? {}) as {
    reasoningBudget?: number;
  };
  const local: LlmRequest = {
    system,
    userMessage,
    maxTokens: req.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
  };
  if (req.reasoning && req.reasoning.effort && req.reasoning.effort !== 'none') {
    local.enableReasoning = true;
  }
  if (typeof providerOptions.reasoningBudget === 'number') {
    local.reasoningBudget = providerOptions.reasoningBudget;
  }
  if (
    req.responseFormat?.type === 'json-object' ||
    req.responseFormat?.type === 'json-schema'
  ) {
    local.responseFormat = 'json';
  }
  return local;
}

export function localResponseToMeshResponse(
  response: LlmResponse,
  config: LlmProviderConfig,
): GenerateResponse {
  return {
    id: `local-${config.id}-${Date.now()}`,
    providerId: config.id,
    modelId: config.modelId,
    message: { role: 'assistant', content: response.text },
    text: response.text,
    toolCalls: [],
    finishReason: 'stop',
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}

export class LocalProviderClient implements ProviderAdapterClient {
  constructor(private readonly local: LlmProvider) {}

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const localReq = meshRequestToLocalRequest(request);
    const localResp = await this.local.generate(localReq);
    return localResponseToMeshResponse(localResp, this.local.config);
  }

  async stream(request: StreamRequest): Promise<StreamResult> {
    const localReq = meshRequestToLocalRequest(request);
    const queue = createEventQueue();
    const config = this.local.config;

    void (async () => {
      try {
        const response = await this.local.generateStream(localReq, {
          onThinking: (text) =>
            queue.push({ type: 'reasoning_delta', data: { delta: text } }),
          onContent: (text) =>
            queue.push({ type: 'content_delta', data: { delta: text } }),
        });
        queue.push({
          type: 'done',
          data: {
            finishReason: 'stop',
            usage: {
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
            },
            providerId: config.id,
            modelId: config.modelId,
          },
        });
        queue.close();
      } catch (err) {
        queue.close(err);
      }
    })();

    return queue.iter;
  }
}

function extractSingleRoleText(
  messages: readonly LlmMeshMessage[],
  role: 'system' | 'user',
): string | null {
  const msg = messages.find((m) => m.role === role);
  if (!msg) return null;
  const content = msg.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((p): p is { type: 'text'; text: string } => p?.type === 'text')
      .map((p) => p.text)
      .join('');
  }
  return null;
}

interface EventQueue {
  push(e: StreamEvent): void;
  close(err?: unknown): void;
  iter: AsyncIterable<StreamEvent>;
}

function createEventQueue(): EventQueue {
  const buffer: StreamEvent[] = [];
  let waiter:
    | { resolve: (v: IteratorResult<StreamEvent>) => void; reject: (e: unknown) => void }
    | null = null;
  let closed = false;
  let error: unknown = undefined;

  const push = (e: StreamEvent): void => {
    if (waiter) {
      const w = waiter;
      waiter = null;
      w.resolve({ value: e, done: false });
    } else {
      buffer.push(e);
    }
  };

  const close = (err?: unknown): void => {
    closed = true;
    if (err !== undefined) error = err;
    if (waiter) {
      const w = waiter;
      waiter = null;
      if (err !== undefined) w.reject(err);
      else w.resolve({ value: undefined, done: true } as IteratorResult<StreamEvent>);
    }
  };

  const iter: AsyncIterable<StreamEvent> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<StreamEvent>> {
          if (buffer.length > 0) {
            return Promise.resolve({ value: buffer.shift() as StreamEvent, done: false });
          }
          if (closed) {
            if (error !== undefined) return Promise.reject(error);
            return Promise.resolve({
              value: undefined,
              done: true,
            } as IteratorResult<StreamEvent>);
          }
          return new Promise<IteratorResult<StreamEvent>>((resolve, reject) => {
            waiter = { resolve, reject };
          });
        },
      };
    },
  };

  return { push, close, iter };
}
