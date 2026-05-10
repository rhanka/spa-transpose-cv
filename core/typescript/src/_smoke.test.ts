import { describe, it, expect } from 'vitest';
import { CORE_VERSION } from './index.js';

describe('core smoke', () => {
  it('exposes a version constant', () => {
    expect(CORE_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
