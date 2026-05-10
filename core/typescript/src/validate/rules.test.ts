import { describe, it, expect } from 'vitest';
import rules from '../../../../core/spec/validation-rules.json' assert { type: 'json' };

describe('validation-rules', () => {
  it('exposes a default ruleset', () => {
    expect(rules.rulesets.default.page1.experienceSectionMustNotAppearOnPage1).toBe(true);
    expect(rules.rulesets.default.header.titleLine1MaxChars).toBe(25);
  });
});
