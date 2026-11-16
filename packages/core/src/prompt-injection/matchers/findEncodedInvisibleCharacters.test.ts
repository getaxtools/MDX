import { describe, expect, it } from 'vitest';
import type { DocumentSegment } from '../DocumentStructure';
import { runInjectionCheck } from '../runInjectionCheck';

function findingsOf(text: string, segments: readonly DocumentSegment[] = []) {
  return runInjectionCheck({ text, origin: 'local', trigger: 'manual' }, { segments }).findings;
}

function ruleFindingsOf(ruleId: string, text: string, segments: readonly DocumentSegment[] = []) {
  return findingsOf(text, segments).filter((finding) => finding.ruleId === ruleId);
}

describe('char-encoded-invisible', () => {
  it('reports a character reference that writes a zero-width space as Low', () => {
    const text = 'pass&#8203;word';

    expect(ruleFindingsOf('char-encoded-invisible', text)).toMatchObject([
      { severity: 'low', from: 4, to: 11 },
    ]);
  });

  it('reports encoded tag characters as Medium and decodes them', () => {
    const text = 'Hello&#xE0068;&#xE0069;!';

    expect(ruleFindingsOf('char-encoded-invisible', text)).toMatchObject([
      { severity: 'medium', decoded: 'hi' },
    ]);
  });

  it('reports named references for joiners and direction marks', () => {
    expect(ruleFindingsOf('char-encoded-invisible', 'a&zwj;b &rlm;c')).toHaveLength(2);
  });

  it('does not report spaces and soft hyphens', () => {
    expect(findingsOf('a&nbsp;b soft&shy;ware &amp; &#65;')).toEqual([]);
  });

  it('does not report references inside code, which are shown as written', () => {
    const text = 'Use `&zwj;` to join';
    const segments: DocumentSegment[] = [{ kind: 'codeSpan', range: { from: 4, to: 11 } }];

    expect(findingsOf(text, segments)).toEqual([]);
  });
});
