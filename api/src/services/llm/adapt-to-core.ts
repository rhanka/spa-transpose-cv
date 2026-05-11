/**
 * Adapter: bridge api/'s existing multi-provider LLM registry to the
 * provider-neutral `LlmProvider` interface defined in `@cv-transpose/core`.
 *
 * Why: core/ must remain framework-agnostic (no env, no fetch wiring) and
 * receive a `LlmProvider` from its host. api/ already has a working registry
 * (`getActiveProvider`) wired to anthropic/openai/mistral/gemini/cohere; this
 * adapter exposes that registry under the shape core expects, without leaking
 * api/-specific details (streaming, reasoning, provider config) into core.
 *
 * Mapping notes:
 *   core.LlmCompleteArgs.systemPrompt     -> registry.LlmRequest.system
 *   core.LlmCompleteArgs.userPrompt       -> registry.LlmRequest.userMessage
 *   core.LlmCompleteArgs.maxTokens        -> registry.LlmRequest.maxTokens
 *                                            (registry requires it; default: 16000)
 *   core.LlmCompleteArgs.temperature      -> dropped (registry has no temperature
 *                                            knob today; concrete providers use
 *                                            their defaults)
 *   core.LlmCompleteArgs.enableReasoning  -> registry.LlmRequest.enableReasoning
 *   core.LlmCompleteArgs.reasoningBudget  -> registry.LlmRequest.reasoningBudget
 *   core.LlmCompleteArgs.onDelta          -> routes to provider.generateStream()
 *                                            and bridges onThinking/onContent
 *                                            callbacks into the unified delta
 *                                            shape { kind, text }.
 *   registry.LlmResponse.text             -> core.LlmCompleteResult.text
 *   registry.LlmResponse.usage            -> core.LlmCompleteResult.usage
 *     input_tokens  -> inputTokens
 *     output_tokens -> outputTokens
 */

import type {
  LlmProvider as CoreLlmProvider,
  LlmCompleteArgs,
  LlmCompleteResult,
} from '@cv-transpose/core';
import { getActiveProvider } from './registry.js';
import type { LlmRequest, LlmResponse } from './types.js';

const DEFAULT_MAX_TOKENS = 16_000;

export interface AdaptRegistryOptions {
  /**
   * Registry provider id (e.g. 'mistral', 'anthropic', 'openai', 'gemini',
   * 'cohere'). Omit to fall back to the `LLM_PROVIDER` env var (the same
   * default `getActiveProvider()` uses).
   */
  provider?: string;
}

export function adaptRegistryToCoreProvider(
  opts: AdaptRegistryOptions = {},
): CoreLlmProvider {
  return {
    async complete(args: LlmCompleteArgs): Promise<LlmCompleteResult> {
      const concrete = await getActiveProvider(opts.provider);
      const req: LlmRequest = {
        system: args.systemPrompt,
        userMessage: args.userPrompt,
        maxTokens: args.maxTokens ?? DEFAULT_MAX_TOKENS,
        enableReasoning: args.enableReasoning,
        reasoningBudget: args.reasoningBudget,
      };

      let r: LlmResponse;
      if (args.onDelta) {
        const onDelta = args.onDelta;
        r = await concrete.generateStream(req, {
          onThinking: (text: string) => onDelta({ kind: 'thinking', text }),
          onContent: (text: string) => onDelta({ kind: 'content', text }),
        });
      } else {
        r = await concrete.generate(req);
      }

      return {
        text: r.text,
        usage: {
          inputTokens: r.usage.input_tokens,
          outputTokens: r.usage.output_tokens,
        },
      };
    },
  };
}
