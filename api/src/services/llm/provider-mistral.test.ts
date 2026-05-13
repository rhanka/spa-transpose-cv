import assert from 'node:assert/strict';
import test from 'node:test';
import { MistralProvider } from './provider-mistral.js';

test('MistralProvider requests JSON object mode when responseFormat is json', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { prompt_tokens: 1, completion_tokens: 2 },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await new MistralProvider().generate({
      system: 'system',
      userMessage: 'user',
      maxTokens: 123,
      responseFormat: 'json',
    });

    assert.deepEqual(requestBody?.response_format, { type: 'json_object' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
