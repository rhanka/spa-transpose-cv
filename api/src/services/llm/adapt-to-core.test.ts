import assert from 'node:assert/strict';
import test from 'node:test';
import { adaptRegistryToCoreProvider } from './adapt-to-core.js';

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
