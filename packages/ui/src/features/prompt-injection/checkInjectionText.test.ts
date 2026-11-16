import { MAX_LISTED_FINDINGS } from '@mdx/core';
import { describe, expect, it } from 'vitest';
import { CHARACTERS_ONLY_LENGTH, checkInjectionText } from './checkInjectionText';

describe('checkInjectionText', () => {
  it('reads the document structure, so a hidden comment is found', () => {
    const result = checkInjectionText({
      text: 'Text <!-- note --> more',
      origin: 'local',
      trigger: 'manual',
    });

    expect(result.findings.map((finding) => finding.ruleId)).toContain('hidden-html-comment');
    expect(result.isPartial).toBe(false);
  });

  it('checks only the characters of a document above 10 MB and marks the result partial', () => {
    const text = `<!-- note -->ign\u200Bore${'a'.repeat(CHARACTERS_ONLY_LENGTH)}`;

    const result = checkInjectionText({ text, origin: 'local', trigger: 'manual' });

    expect(result.findings.map((finding) => finding.ruleId)).toEqual(['char-zero-width']);
    expect(result.isPartial).toBe(true);
  });

  it(`lists at most ${String(MAX_LISTED_FINDINGS)} findings and marks the result partial`, () => {
    const text = Array.from({ length: MAX_LISTED_FINDINGS + 200 }, () => 'a\u200Bb').join(' ');

    const result = checkInjectionText({ text, origin: 'local', trigger: 'manual' });

    expect(result.findings).toHaveLength(MAX_LISTED_FINDINGS);
    expect(result.isPartial).toBe(true);
  });
});
