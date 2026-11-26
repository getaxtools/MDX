import { describe, expect, it } from 'vitest';
import type { DocumentSegment } from '../DocumentStructure';
import { runInjectionCheck } from '../runInjectionCheck';

function findingsOf(text: string, segments: readonly DocumentSegment[] = []) {
  return runInjectionCheck({ text, origin: 'local', trigger: 'manual' }, { segments }).findings;
}

function ruleFindingsOf(ruleId: string, text: string, segments: readonly DocumentSegment[] = []) {
  return findingsOf(text, segments).filter((finding) => finding.ruleId === ruleId);
}

describe('char-invisible-filler', () => {
  it.each([
    ['a Hangul filler', 'user\u3164name'],
    ['a halfwidth Hangul filler', 'user\uFFA0name'],
    ['a braille blank between Latin words', 'ignore\u2800this'],
    ['a combining grapheme joiner', 'pass\u034Fword'],
    ['a Khmer inherent vowel', 'a\u17B4b'],
  ])('reports %s as Medium', (_description, text) => {
    expect(ruleFindingsOf('char-invisible-filler', text)).toMatchObject([{ severity: 'medium' }]);
  });

  it('does not report braille blanks between braille patterns', () => {
    expect(ruleFindingsOf('char-invisible-filler', '⠁⠃\u2800⠉\u2800\u2800⠙')).toEqual([]);
  });

  it('does not report jamo fillers that complete a syllable', () => {
    expect(ruleFindingsOf('char-invisible-filler', '\u115Fᅡ ᄀ\u1160')).toEqual([]);
  });
});
