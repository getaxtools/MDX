import { describe, expect, it } from 'vitest';
import type { DocumentSegment } from '../DocumentStructure';
import { runInjectionCheck } from '../runInjectionCheck';

function findingsOf(text: string, segments: readonly DocumentSegment[] = []) {
  return runInjectionCheck({ text, origin: 'local', trigger: 'manual' }, { segments }).findings;
}

function ruleFindingsOf(ruleId: string, text: string, segments: readonly DocumentSegment[] = []) {
  return findingsOf(text, segments).filter((finding) => finding.ruleId === ruleId);
}

describe('char-private-use', () => {
  it('reports all private use code points as one Low finding with their count', () => {
    const findings = ruleFindingsOf('char-private-use', 'Branch \uE0A0 main \uE0B0 \u{F0001}');

    expect(findings).toMatchObject([{ severity: 'low', from: 7, messageArguments: { count: 3 } }]);
  });

  it('counts unassigned code points, noncharacters and unpaired surrogates', () => {
    const findings = ruleFindingsOf('char-private-use', 'a\u0378b\uFDD0c\uD800d');

    expect(findings).toMatchObject([{ from: 1, messageArguments: { count: 3 } }]);
  });
});
