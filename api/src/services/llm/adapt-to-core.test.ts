import assert from 'node:assert/strict';
import test from 'node:test';
import { adaptRegistryToCoreProvider } from './adapt-to-core.js';
import { registerProvider } from './registry.js';
import type {
  LlmProvider,
  LlmProviderConfig,
  LlmRequest,
  LlmResponse,
  LlmStreamCallbacks,
} from './types.js';

test('adaptRegistryToCoreProvider returns an object with a complete() method', () => {
  const adapter = adaptRegistryToCoreProvider({ provider: 'mistral' });
  assert.equal(typeof adapter.complete, 'function');
});

test('adaptRegistryToCoreProvider exposes complete() that takes one argument (LlmCompleteArgs)', () => {
  const adapter = adaptRegistryToCoreProvider({ provider: 'mistral' });
  // Function arity check: complete() expects a single args object.
  assert.equal(adapter.complete.length, 1);
});

test('adaptRegistryToCoreProvider works without a default provider name (falls back to LLM_PROVIDER env)', () => {
  const adapter = adaptRegistryToCoreProvider();
  assert.equal(typeof adapter.complete, 'function');
});

// -------- Routing tests (with a fake provider registered into the registry) --------

/**
 * Build a fake LlmProvider that records the request and either emits streaming
 * deltas (when generateStream is called) or returns a static response.
 */
function makeFakeProvider(): {
  provider: LlmProvider;
  captured: { req?: LlmRequest; mode?: 'generate' | 'generateStream' };
} {
  const captured: { req?: LlmRequest; mode?: 'generate' | 'generateStream' } = {};
  const config: LlmProviderConfig = {
    id: 'cohere',
    modelId: 'fake-model',
    label: 'Fake',
    costPer1MInput: 0,
    costPer1MOutput: 0,
    co2ePer1kOutput: 0,
  };
  const provider: LlmProvider = {
    config,
    async generate(req: LlmRequest): Promise<LlmResponse> {
      captured.req = req;
      captured.mode = 'generate';
      return {
        text: 'non-streamed-final-text',
        usage: { input_tokens: 11, output_tokens: 22 },
      };
    },
    async generateStream(
      req: LlmRequest,
      cb: LlmStreamCallbacks,
    ): Promise<LlmResponse> {
      captured.req = req;
      captured.mode = 'generateStream';
      cb.onThinking?.('thinking-chunk-1');
      cb.onContent?.('content-chunk-1');
      cb.onThinking?.('thinking-chunk-2');
      cb.onContent?.('content-chunk-2');
      return {
        text: 'streamed-final-text',
        usage: { input_tokens: 33, output_tokens: 44 },
      };
    },
  };
  return { provider, captured };
}

test('adapter routes to generate() when onDelta is undefined and maps usage', async () => {
  const { provider, captured } = makeFakeProvider();
  // Override the cohere factory in the registry with our fake.
  // Note: registry caches instances on first resolve; we rely on test ordering
  // (this is the first test in this file to resolve `cohere`) so the cached
  // instance for this test run is our fake.
  registerProvider('cohere', async () => provider);

  const adapter = adaptRegistryToCoreProvider({ provider: 'cohere' });
  const result = await adapter.complete({
    systemPrompt: 'sys',
    userPrompt: 'usr',
    maxTokens: 1234,
  });

  assert.equal(captured.mode, 'generate');
  assert.equal(captured.req?.system, 'sys');
  assert.equal(captured.req?.userMessage, 'usr');
  assert.equal(captured.req?.maxTokens, 1234);
  assert.equal(result.text, 'non-streamed-final-text');
  assert.deepEqual(result.usage, { inputTokens: 11, outputTokens: 22 });
});

test('adapter routes to generateStream() when onDelta is provided, forwards reasoning, bridges deltas', async () => {
  const { provider, captured } = makeFakeProvider();
  // Re-register with a fresh fake; the registry caches by id, so we need to
  // also clear the cached instance. We do that by mutating the existing
  // cached provider's behavior is not possible without reaching into private
  // state, so instead we rely on the fact that registerProvider replaces the
  // factory and that we use a *different* provider id here ('gemini').
  registerProvider('gemini', async () => provider);

  const deltas: { kind: 'thinking' | 'content'; text: string }[] = [];
  const adapter = adaptRegistryToCoreProvider({ provider: 'gemini' });
  const result = await adapter.complete({
    systemPrompt: 'sys2',
    userPrompt: 'usr2',
    maxTokens: 9999,
    enableReasoning: true,
    reasoningBudget: 4096,
    onDelta: (d) => deltas.push(d),
  });

  assert.equal(captured.mode, 'generateStream');
  assert.equal(captured.req?.system, 'sys2');
  assert.equal(captured.req?.userMessage, 'usr2');
  assert.equal(captured.req?.maxTokens, 9999);
  assert.equal(captured.req?.enableReasoning, true);
  assert.equal(captured.req?.reasoningBudget, 4096);

  assert.deepEqual(deltas, [
    { kind: 'thinking', text: 'thinking-chunk-1' },
    { kind: 'content', text: 'content-chunk-1' },
    { kind: 'thinking', text: 'thinking-chunk-2' },
    { kind: 'content', text: 'content-chunk-2' },
  ]);

  assert.equal(result.text, 'streamed-final-text');
  assert.deepEqual(result.usage, { inputTokens: 33, outputTokens: 44 });
});

test('adapter forwards default maxTokens when none provided', async () => {
  const { provider, captured } = makeFakeProvider();
  registerProvider('openai', async () => provider);

  const adapter = adaptRegistryToCoreProvider({ provider: 'openai' });
  await adapter.complete({ systemPrompt: 's', userPrompt: 'u' });

  assert.equal(captured.req?.maxTokens, 16_000);
});
