import { describe, expect, it } from 'vitest';
import type { DocumentSegment } from '../DocumentStructure';
import { runInjectionCheck } from '../runInjectionCheck';

function findingsOf(text: string, segments: readonly DocumentSegment[] = []) {
  return runInjectionCheck({ text, origin: 'local', trigger: 'manual' }, { segments }).findings;
}

function ruleFindingsOf(ruleId: string, text: string, segments: readonly DocumentSegment[] = []) {
  return findingsOf(text, segments).filter((finding) => finding.ruleId === ruleId);
}

describe('char-control', () => {
  it('reports a terminal escape sequence as High, covering the whole sequence', () => {
    const text = 'Done \u001b[2J\u001b[31mred';

    const findings = ruleFindingsOf('char-control', text);

    expect(findings).toMatchObject([
      { severity: 'high', from: 5, to: 9 },
      { severity: 'high', from: 9, to: 14 },
    ]);
  });

  it('reports an operating system command sequence up to its bell', () => {
    const text = 'x\u001b]0;title\u0007y';

    expect(ruleFindingsOf('char-control', text)).toMatchObject([{ severity: 'high', from: 1, to: 11 }]);
  });

  it('reports other control characters as Medium, joining a run into one finding', () => {
    expect(ruleFindingsOf('char-control', 'a\u0000\u0008b')).toMatchObject([
      { severity: 'medium', from: 1, to: 3 },
    ]);
  });

  it('lists a form feed as Info', () => {
    expect(ruleFindingsOf('char-control', 'page one\u000cpage two')).toMatchObject([{ severity: 'info' }]);
  });

  it('never reports tabs and line breaks', () => {
    expect(findingsOf('a\tb\r\nc\rd\n')).toEqual([]);
  });
});
