/**
 * Mesh-facade adapter: exposes a local `LlmProvider` (api/src/services/llm/
 * types.ts) whose calls are routed through `@sentropic/llm-mesh`'s
 * `createLlmMesh` runtime, while the underlying provider SDK work is still
 * performed by the existing local provider (injected as a mesh client via
 * `mesh-client-bridge.ts`).
 *
 * Why: first-increment spike validating that the mesh facade can wrap the
 * current LLM stack without changing public API behavior or removing any
 * provider SDK. Not yet wired into the runtime registry — exposes only the
 * `MeshLlmProvider` class and the pure mapping helpers used by tests.
 *
 * Adoption constraints honored (see docs/superpowers/specs/2026-05-16-
 * sentropic-integration-request.md and Sentropic response 2026-05-18):
 * - injected provider clients only; no SDK removed
 * - reasoning numeric budget kept local (providerOptions.reasoningBudget)
 * - cost / CO2 overlay kept on local config
 * - `done.usage` treated as optional (fallback to 0/0)
 * - no cross-provider JSON-schema normalization assumed
 */

import {
  AnthropicAdapter,
  CohereAdapter,
  createLlmMesh,
  createProviderRegistry,
  GeminiAdapter,
  MistralAdapter,
  OpenAIAdapter,
  type GenerateRequest,
  type GenerateResponse,
  type LlmMesh,
  type ProviderId,
} from '@sentropic/llm-mesh';
import { LocalProviderClient } from './mesh-client-bridge.js';
import type {
  LlmProvider,
  LlmProviderConfig,
  LlmRequest,
  LlmResponse,
  LlmStreamCallbacks,
} from './types.js';

const DEFAULT_MAX_TOKENS = 16_000;

type AdapterCtor =
  | typeof AnthropicAdapter
  | typeof OpenAIAdapter
  | typeof MistralAdapter
  | typeof GeminiAdapter
  | typeof CohereAdapter;

const ADAPTER_BY_PROVIDER: Record<ProviderId, AdapterCtor> = {
  anthropic: AnthropicAdapter,
  openai: OpenAIAdapter,
  mistral: MistralAdapter,
  gemini: GeminiAdapter,
  cohere: CohereAdapter,
};

export function toMeshRequest(
  req: LlmRequest,
  providerId: ProviderId,
  modelId: string,
): GenerateRequest {
  const mesh: GenerateRequest = {
    providerId,
    modelId,
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.userMessage },
    ],
    maxOutputTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
  };
  if (req.enableReasoning) {
    mesh.reasoning = { effort: 'low' };
  }
  if (req.responseFormat === 'json') {
    mesh.responseFormat = { type: 'json-object' };
  }
  if (typeof req.reasoningBudget === 'number') {
    mesh.providerOptions = { reasoningBudget: req.reasoningBudget };
  }
  return mesh;
}

export function fromMeshResponse(response: GenerateResponse): LlmResponse {
  return {
    text: response.text,
    usage: {
      input_tokens: response.usage?.inputTokens ?? 0,
      output_tokens: response.usage?.outputTokens ?? 0,
    },
  };
}

export class MeshLlmProvider implements LlmProvider {
  readonly config: LlmProviderConfig;
  private readonly mesh: LlmMesh;
  private readonly providerId: ProviderId;
  private readonly modelId: string;

  constructor(private readonly local: LlmProvider) {
    this.config = local.config;
    this.providerId = local.config.id;
    this.modelId = local.config.modelId;
    const AdapterCtor = ADAPTER_BY_PROVIDER[this.providerId];
    const adapter = new AdapterCtor({ client: new LocalProviderClient(local) });
    const registry = createProviderRegistry([adapter]);
    // Provide a dummy auth resolver: the injected client owns its own SDK key,
    // but the mesh `prepare()` step calls adapter.validateAuth() which expects
    // a non-empty auth source by default.
    this.mesh = createLlmMesh({
      registry,
      authResolver: () => ({
        material: { type: 'direct-token', token: 'injected-client-owns-auth' },
        descriptor: { sourceType: 'direct-token' },
      }),
    });
  }

  async generate(req: LlmRequest): Promise<LlmResponse> {
    const meshReq = toMeshRequest(req, this.providerId, this.modelId);
    const meshResp = await this.mesh.generate(meshReq);
    return fromMeshResponse(meshResp);
  }

  async generateStream(
    req: LlmRequest,
    cb: LlmStreamCallbacks,
  ): Promise<LlmResponse> {
    const meshReq = toMeshRequest(req, this.providerId, this.modelId);
    const stream = await this.mesh.stream(meshReq);
    let text = '';
    let usage: { inputTokens?: number; outputTokens?: number } = {};
    for await (const event of stream) {
      switch (event.type) {
        case 'reasoning_delta':
          cb.onThinking?.(event.data.delta);
          break;
        case 'content_delta':
          cb.onContent?.(event.data.delta);
          text += event.data.delta;
          break;
        case 'done':
          if (event.data.usage) usage = event.data.usage;
          break;
        case 'error':
          throw new Error(event.data.message ?? 'mesh stream error');
        default:
          break;
      }
    }
    return {
      text,
      usage: {
        input_tokens: usage.inputTokens ?? 0,
        output_tokens: usage.outputTokens ?? 0,
      },
    };
  }
}
