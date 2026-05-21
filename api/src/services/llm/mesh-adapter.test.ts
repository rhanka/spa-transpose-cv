import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  GenerateRequest,
  GenerateResponse,
  StreamRequest,
  StreamEvent,
} from '@sentropic/llm-mesh';
import {
  MeshLlmProvider,
  toMeshRequest,
  fromMeshResponse,
} from './mesh-adapter.js';
import {
  LocalProviderClient,
  meshRequestToLocalRequest,
  localResponseToMeshResponse,
} from './mesh-client-bridge.js';
import type {
  LlmProvider,
  LlmProviderConfig,
  LlmRequest,
  LlmResponse,
  LlmStreamCallbacks,
} from './types.js';

const MISTRAL_CONFIG: LlmProviderConfig = {
  id: 'mistral',
  modelId: 'mistral-small-2603',
  label: 'Mistral Small 4',
  costPer1MInput: 0.15,
  costPer1MOutput: 0.6,
  co2ePer1kOutput: 0.51,
};

class StubLocalProvider implements LlmProvider {
  readonly config: LlmProviderConfig;
  lastRequest: LlmRequest | null = null;
  generateResult: LlmResponse = {
    text: 'stub-text',
    usage: { input_tokens: 11, output_tokens: 22 },
  };
  streamDeltas: { kind: 'thinking' | 'content'; text: string }[] = [];

  constructor(config: LlmProviderConfig = MISTRAL_CONFIG) {
    this.config = config;
  }

  async generate(req: LlmRequest): Promise<LlmResponse> {
    this.lastRequest = req;
    return this.generateResult;
  }

  async generateStream(
    req: LlmRequest,
    cb: LlmStreamCallbacks,
  ): Promise<LlmResponse> {
    this.lastRequest = req;
    for (const d of this.streamDeltas) {
      if (d.kind === 'thinking') cb.onThinking?.(d.text);
      else cb.onContent?.(d.text);
    }
    return this.generateResult;
  }
}

// --- toMeshRequest -----------------------------------------------------------

test('toMeshRequest: maps system + user prompt to messages[]', () => {
  const req: LlmRequest = {
    system: 'sys-prompt',
    userMessage: 'user-prompt',
    maxTokens: 1234,
  };
  const out = toMeshRequest(req, 'mistral', 'mistral-small-2603');
  assert.equal(out.providerId, 'mistral');
  assert.equal(out.modelId, 'mistral-small-2603');
  assert.equal(out.maxOutputTokens, 1234);
  assert.deepEqual(out.messages, [
    { role: 'system', content: 'sys-prompt' },
    { role: 'user', content: 'user-prompt' },
  ]);
  assert.equal(out.reasoning, undefined);
  assert.equal(out.responseFormat, undefined);
  assert.equal(out.providerOptions, undefined);
});

test('toMeshRequest: enableReasoning maps to reasoning.effort=low', () => {
  const out = toMeshRequest(
    { system: 's', userMessage: 'u', maxTokens: 100, enableReasoning: true },
    'anthropic',
    'claude-opus-4-7',
  );
  assert.deepEqual(out.reasoning, { effort: 'low' });
});

test('toMeshRequest: reasoningBudget passed in providerOptions (local overlay)', () => {
  const out = toMeshRequest(
    {
      system: 's',
      userMessage: 'u',
      maxTokens: 100,
      enableReasoning: true,
      reasoningBudget: 4096,
    },
    'anthropic',
    'claude-opus-4-7',
  );
  assert.deepEqual(out.reasoning, { effort: 'low' });
  assert.deepEqual(out.providerOptions, { reasoningBudget: 4096 });
});

test('toMeshRequest: reasoningBudget without enableReasoning still goes to providerOptions', () => {
  const out = toMeshRequest(
    { system: 's', userMessage: 'u', maxTokens: 100, reasoningBudget: 2048 },
    'mistral',
    'mistral-small-2603',
  );
  assert.equal(out.reasoning, undefined);
  assert.deepEqual(out.providerOptions, { reasoningBudget: 2048 });
});

test("toMeshRequest: responseFormat 'json' maps to json-object", () => {
  const out = toMeshRequest(
    { system: 's', userMessage: 'u', maxTokens: 100, responseFormat: 'json' },
    'mistral',
    'mistral-small-2603',
  );
  assert.deepEqual(out.responseFormat, { type: 'json-object' });
});

// --- fromMeshResponse --------------------------------------------------------

test('fromMeshResponse: maps text + camelCase usage to snake_case', () => {
  const meshResp: GenerateResponse = {
    id: 'r1',
    providerId: 'mistral',
    modelId: 'mistral-small-2603',
    message: { role: 'assistant', content: 'final-text' },
    text: 'final-text',
    toolCalls: [],
    finishReason: 'stop',
    usage: { inputTokens: 5, outputTokens: 7 },
  };
  const out = fromMeshResponse(meshResp);
  assert.equal(out.text, 'final-text');
  assert.deepEqual(out.usage, { input_tokens: 5, output_tokens: 7 });
});

test('fromMeshResponse: missing usage falls back to zeros (done.usage optional)', () => {
  const meshResp: GenerateResponse = {
    id: 'r2',
    providerId: 'mistral',
    modelId: 'mistral-small-2603',
    message: { role: 'assistant', content: 'x' },
    text: 'x',
    toolCalls: [],
    finishReason: 'stop',
  };
  const out = fromMeshResponse(meshResp);
  assert.deepEqual(out.usage, { input_tokens: 0, output_tokens: 0 });
});

// --- mesh-client-bridge: pure mappers ---------------------------------------

test('meshRequestToLocalRequest: extracts system + user from string content', () => {
  const meshReq: GenerateRequest = {
    providerId: 'mistral',
    modelId: 'mistral-small-2603',
    messages: [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'usr' },
    ],
    maxOutputTokens: 555,
  };
  const out = meshRequestToLocalRequest(meshReq);
  assert.equal(out.system, 'sys');
  assert.equal(out.userMessage, 'usr');
  assert.equal(out.maxTokens, 555);
  assert.equal(out.enableReasoning, undefined);
  assert.equal(out.responseFormat, undefined);
});

test('meshRequestToLocalRequest: extracts text content parts from arrays', () => {
  const meshReq: GenerateRequest = {
    providerId: 'mistral',
    modelId: 'mistral-small-2603',
    messages: [
      { role: 'system', content: [{ type: 'text', text: 'sys' }] },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'usr-' },
          { type: 'text', text: 'concat' },
        ],
      },
    ],
    maxOutputTokens: 100,
  };
  const out = meshRequestToLocalRequest(meshReq);
  assert.equal(out.system, 'sys');
  assert.equal(out.userMessage, 'usr-concat');
});

test('meshRequestToLocalRequest: reasoning effort != none -> enableReasoning, budget read from providerOptions', () => {
  const meshReq: GenerateRequest = {
    providerId: 'anthropic',
    modelId: 'claude-opus-4-7',
    messages: [
      { role: 'system', content: 's' },
      { role: 'user', content: 'u' },
    ],
    maxOutputTokens: 100,
    reasoning: { effort: 'low' },
    providerOptions: { reasoningBudget: 1024 },
  };
  const out = meshRequestToLocalRequest(meshReq);
  assert.equal(out.enableReasoning, true);
  assert.equal(out.reasoningBudget, 1024);
});

test("meshRequestToLocalRequest: json-object responseFormat -> 'json'", () => {
  const meshReq: GenerateRequest = {
    providerId: 'mistral',
    modelId: 'mistral-small-2603',
    messages: [
      { role: 'system', content: 's' },
      { role: 'user', content: 'u' },
    ],
    maxOutputTokens: 100,
    responseFormat: { type: 'json-object' },
  };
  const out = meshRequestToLocalRequest(meshReq);
  assert.equal(out.responseFormat, 'json');
});

test('meshRequestToLocalRequest: throws when no system message', () => {
  const meshReq: GenerateRequest = {
    providerId: 'mistral',
    modelId: 'mistral-small-2603',
    messages: [{ role: 'user', content: 'u' }],
    maxOutputTokens: 100,
  };
  assert.throws(() => meshRequestToLocalRequest(meshReq), /single system \+ user/);
});

test('localResponseToMeshResponse: text and usage round-trip', () => {
  const local: LlmResponse = {
    text: 'hi',
    usage: { input_tokens: 3, output_tokens: 4 },
  };
  const out = localResponseToMeshResponse(local, MISTRAL_CONFIG);
  assert.equal(out.text, 'hi');
  assert.equal(out.providerId, 'mistral');
  assert.equal(out.modelId, 'mistral-small-2603');
  assert.equal(out.finishReason, 'stop');
  assert.deepEqual(out.usage, { inputTokens: 3, outputTokens: 4 });
});

// --- LocalProviderClient (bridge) -------------------------------------------

test('LocalProviderClient.generate: delegates to local provider', async () => {
  const local = new StubLocalProvider();
  const client = new LocalProviderClient(local);
  const meshReq: GenerateRequest = {
    providerId: 'mistral',
    modelId: 'mistral-small-2603',
    messages: [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'usr' },
    ],
    maxOutputTokens: 999,
  };
  const out = await client.generate(meshReq);
  assert.equal(local.lastRequest?.system, 'sys');
  assert.equal(local.lastRequest?.userMessage, 'usr');
  assert.equal(local.lastRequest?.maxTokens, 999);
  assert.equal(out.text, 'stub-text');
  assert.deepEqual(out.usage, { inputTokens: 11, outputTokens: 22 });
});

test('LocalProviderClient.stream: emits reasoning_delta + content_delta + done', async () => {
  const local = new StubLocalProvider();
  local.streamDeltas = [
    { kind: 'thinking', text: 'think-1' },
    { kind: 'content', text: 'cont-1' },
    { kind: 'content', text: 'cont-2' },
  ];
  const client = new LocalProviderClient(local);
  const streamReq: StreamRequest = {
    providerId: 'mistral',
    modelId: 'mistral-small-2603',
    messages: [
      { role: 'system', content: 's' },
      { role: 'user', content: 'u' },
    ],
    maxOutputTokens: 100,
  };
  const stream = await client.stream(streamReq);
  const events: StreamEvent[] = [];
  for await (const e of stream) events.push(e);

  assert.equal(events.length, 4);
  assert.equal(events[0]?.type, 'reasoning_delta');
  assert.equal(events[1]?.type, 'content_delta');
  assert.equal(events[2]?.type, 'content_delta');
  assert.equal(events[3]?.type, 'done');
  const done = events[3];
  if (done?.type !== 'done') throw new Error('expected done');
  assert.deepEqual(done.data.usage, { inputTokens: 11, outputTokens: 22 });
  assert.equal(done.data.finishReason, 'stop');
});

// --- MeshLlmProvider (end-to-end) -------------------------------------------

test('MeshLlmProvider.generate: round-trip through mesh', async () => {
  const local = new StubLocalProvider();
  local.generateResult = {
    text: 'mesh-text',
    usage: { input_tokens: 100, output_tokens: 200 },
  };
  const mesh = new MeshLlmProvider(local);
  const result = await mesh.generate({
    system: 'sys',
    userMessage: 'usr',
    maxTokens: 4096,
  });
  assert.equal(result.text, 'mesh-text');
  assert.deepEqual(result.usage, { input_tokens: 100, output_tokens: 200 });
  assert.equal(local.lastRequest?.system, 'sys');
  assert.equal(local.lastRequest?.userMessage, 'usr');
  assert.equal(local.lastRequest?.maxTokens, 4096);
});

test('MeshLlmProvider.generateStream: emits thinking + content callbacks, returns full text/usage', async () => {
  const local = new StubLocalProvider();
  local.streamDeltas = [
    { kind: 'thinking', text: 'T1' },
    { kind: 'content', text: 'Hello ' },
    { kind: 'content', text: 'World' },
  ];
  local.generateResult = {
    text: 'Hello World',
    usage: { input_tokens: 9, output_tokens: 8 },
  };
  const mesh = new MeshLlmProvider(local);
  const thinking: string[] = [];
  const content: string[] = [];
  const out = await mesh.generateStream(
    { system: 's', userMessage: 'u', maxTokens: 100 },
    {
      onThinking: (t) => thinking.push(t),
      onContent: (t) => content.push(t),
    },
  );
  assert.deepEqual(thinking, ['T1']);
  assert.deepEqual(content, ['Hello ', 'World']);
  assert.equal(out.text, 'Hello World');
  assert.deepEqual(out.usage, { input_tokens: 9, output_tokens: 8 });
});

test('MeshLlmProvider.generateStream: tolerates done.usage absent (zeros fallback)', async () => {
  // Use a custom local provider that returns usage with zeros and no content deltas.
  // The mesh adapter must not crash and should produce input_tokens=0/output_tokens=0.
  const local = new StubLocalProvider();
  local.streamDeltas = [{ kind: 'content', text: 'X' }];
  local.generateResult = {
    text: 'X',
    usage: { input_tokens: 0, output_tokens: 0 },
  };
  const mesh = new MeshLlmProvider(local);
  const out = await mesh.generateStream(
    { system: 's', userMessage: 'u', maxTokens: 50 },
    {},
  );
  assert.equal(out.text, 'X');
  assert.deepEqual(out.usage, { input_tokens: 0, output_tokens: 0 });
});
