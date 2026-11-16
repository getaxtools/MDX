import { describe, expect, it } from 'vitest';
import { MAX_LISTED_FINDINGS, runCharacterCheck, runInjectionCheck } from './runInjectionCheck';
import { Ruleset } from './Ruleset';

describe('runInjectionCheck', () => {
  it('finds nothing in plain text and reports the rules version', () => {
    const result = runInjectionCheck({ text: '# Notes\n\nPlain text.', origin: 'local', trigger: 'manual' });

    expect(result).toEqual({
      rulesetVersion: Ruleset.bundled().version,
      findings: [],
      isAgentFile: false,
      ignoredCount: 0,
      isPartial: false,
    });
  });

  it('gives each finding its line, column, excerpt and arguments', () => {
    const text = 'Title\nign\u200Bore';

    const [finding] = runInjectionCheck({ text, origin: 'local', trigger: 'manual' }).findings;

    expect(finding).toEqual({
      ruleId: 'char-zero-width',
      severity: 'medium',
      from: 9,
      to: 10,
      line: 1,
      column: 3,
      excerpt: 'ign⟨ZWSP⟩ore',
      messageArguments: { count: 1 },
    });
  });

  it('raises hidden characters in documents marked as agent context', () => {
    const request = {
      text: 'a\u200Bb',
      origin: 'local',
      trigger: 'automatic',
      isAgentContext: true,
    } as const;

    const result = runInjectionCheck(request);

    expect(result.isAgentFile).toBe(true);
    expect(result.findings[0]?.severity).toBe('high');
  });

  it('lists findings in document order', () => {
    const text = 'a\u202Eb c\u200Bd e\u0000f';

    const ruleIds = runInjectionCheck({ text, origin: 'local', trigger: 'manual' }).findings.map(
      (finding) => finding.ruleId,
    );

    expect(ruleIds).toEqual([
      'char-bidi-override',
      'char-bidi-unbalanced',
      'char-zero-width',
      'char-control',
    ]);
  });

  it(`lists at most ${String(MAX_LISTED_FINDINGS)} findings, keeping the highest, and marks the result partial`, () => {
    const manyLow = Array.from({ length: MAX_LISTED_FINDINGS + 5 }, () => 'a\u200Bb').join(' ');
    const text = `${manyLow} \u{E0041}`;

    const result = runInjectionCheck({ text, origin: 'local', trigger: 'manual' });

    expect(result.findings).toHaveLength(MAX_LISTED_FINDINGS);
    expect(result.isPartial).toBe(true);
    expect(result.findings.at(-1)?.ruleId).toBe('char-unicode-tags');
  });

  it('runs only the character rules on request and marks the result partial', () => {
    const text = 'Plain <!-- a hidden comment --> ign\u200Bore';

    const result = runCharacterCheck({ text, origin: 'local', trigger: 'manual' });

    expect(result.findings.map((finding) => finding.ruleId)).toEqual(['char-zero-width']);
    expect(result.isPartial).toBe(true);
  });
});
