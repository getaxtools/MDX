import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isAtLeast, runInjectionCheck, type InjectionFinding } from '@mdx/core';
import { collectDocumentStructure } from '@mdx/renderer';
import { describe, expect, it } from 'vitest';

const CORPUS_FILE = join(
  import.meta.dirname,
  '..',
  '..',
  'fixtures',
  'prompt-injection',
  'instruction-samples.json',
);
const INSTRUCTION_DETECTION_TARGET = 0.85;
const MAX_SHARE_OF_HARMLESS_WITH_MEDIUM = 0.02;

interface Sample {
  readonly id: string;
  readonly text: string;
  readonly isAgentFile?: boolean;
  readonly mayBeMedium?: boolean;
  readonly expected?: readonly string[];
}

const corpus = JSON.parse(readFileSync(CORPUS_FILE, 'utf8')) as {
  readonly malicious: readonly Sample[];
  readonly harmless: readonly Sample[];
};

function findingsOf(sample: Sample): readonly InjectionFinding[] {
  const text = sample.text.replace(/\\u\{([0-9A-Fa-f]{1,6})\}/g, (_match, hex: string) =>
    String.fromCodePoint(Number.parseInt(hex, 16)),
  );
  return runInjectionCheck(
    { text, origin: 'local', trigger: 'manual', isAgentContext: sample.isAgentFile === true },
    collectDocumentStructure(text),
  ).findings;
}

function detectionShare(group: string): number {
  const expectations = corpus.malicious.flatMap((sample) =>
    (sample.expected ?? [])
      .filter((ruleId) => ruleId.startsWith(group))
      .map((ruleId) => ({ sample, ruleId })),
  );
  const found = expectations.filter(({ sample, ruleId }) =>
    findingsOf(sample).some((finding) => finding.ruleId === ruleId),
  );
  return found.length / expectations.length;
}

function groupFindingsOf(sample: Sample, group: string): InjectionFinding[] {
  return findingsOf(sample).filter((finding) => finding.ruleId.startsWith(group));
}

describe('instruction and agent-file corpus scorecard', () => {
  it(`finds at least ${String(INSTRUCTION_DETECTION_TARGET * 100)}% of the English instruction samples`, () => {
    expect(detectionShare('instr-')).toBeGreaterThanOrEqual(INSTRUCTION_DETECTION_TARGET);
  });

  it('finds every agent-file sample', () => {
    expect(detectionShare('agent-')).toBe(1);
  });

  it('reports instruction findings at Medium on at most 2% of harmless samples, and security articles never at High', () => {
    const ordinary = corpus.harmless.filter((sample) => sample.mayBeMedium !== true);
    const ordinaryWithMedium = ordinary.filter((sample) =>
      groupFindingsOf(sample, 'instr-').some((finding) => isAtLeast(finding.severity, 'medium')),
    );
    const articleHighs = corpus.harmless
      .filter((sample) => sample.mayBeMedium === true)
      .flatMap((sample) =>
        groupFindingsOf(sample, 'instr-').filter((finding) => finding.severity === 'high'),
      );

    expect(ordinaryWithMedium.map((sample) => sample.id)).toEqual([]);
    expect(ordinaryWithMedium.length / ordinary.length).toBeLessThanOrEqual(
      MAX_SHARE_OF_HARMLESS_WITH_MEDIUM,
    );
    expect(articleHighs).toEqual([]);
  });

  it('reports nothing at High on agent-file style, OpenSpec and Spec Kit samples', () => {
    const highs = corpus.harmless
      .filter((sample) => sample.isAgentFile === true)
      .flatMap((sample) =>
        findingsOf(sample)
          .filter((finding) => finding.severity === 'high')
          .map((f) => `${sample.id}: ${f.ruleId}`),
      );

    expect(highs).toEqual([]);
  });
});
