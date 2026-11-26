import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  bundledRulesetWithLists,
  isAtLeast,
  Ruleset,
  runInjectionCheck,
  type InjectionFinding,
  type InjectionSeverity,
} from '@mdx/core';
import { collectDocumentStructure } from '@mdx/renderer';
import { describe, expect, it } from 'vitest';

const CORPUS_FILE = join(
  import.meta.dirname,
  '..',
  '..',
  'fixtures',
  'prompt-injection',
  'markdown-samples.json',
);
const TEST_BADGE_HOST = 'badges.example.test';
const TEST_COLLECTOR_HOST = 'collector.example.test';
const RESERVED_HOST = /(^|\.)(invalid|test|example|localhost)$|(^|\.)example\.(com|net|org)$/;
const ADDRESS = /\b(?:https?:)?\/\/([^/\s"')<>?#]+)/g;
const EXFILTRATION_DETECTION_TARGET = 0.95;
const MAX_SHARE_OF_HARMLESS_WITH_MEDIUM = 0.02;
const ZERO_MEDIUM_RULES = new Set([
  'hidden-css',
  'hidden-attribute',
  'hidden-removed-element',
  'char-confusable-url',
]);

interface ExpectedFinding {
  readonly ruleId: string;
  readonly minSeverity: InjectionSeverity;
}

interface Sample {
  readonly id: string;
  readonly text: string;
  readonly expected?: readonly ExpectedFinding[];
}

interface MarkdownCorpus {
  readonly malicious: readonly Sample[];
  readonly harmless: readonly Sample[];
}

const corpus = JSON.parse(readFileSync(CORPUS_FILE, 'utf8')) as MarkdownCorpus;

/** The bundled rules, with reserved names standing in for a real badge service and a real request collector. */
function corpusRuleset(): Ruleset {
  const bundled = bundledRulesetWithLists();
  const lists = bundled.lists as Record<string, readonly string[]>;
  return Ruleset.parse({
    ...bundled,
    lists: {
      ...lists,
      badgeHosts: [...(lists.badgeHosts ?? []), TEST_BADGE_HOST],
      collectorHosts: [...(lists.collectorHosts ?? []), TEST_COLLECTOR_HOST],
    },
  });
}

const ruleset = corpusRuleset();

function textOf(sample: Sample): string {
  return sample.text.replace(/\\u\{([0-9A-Fa-f]{1,6})\}/g, (_match, hex: string) =>
    String.fromCodePoint(Number.parseInt(hex, 16)),
  );
}

function findingsOf(sample: Sample): readonly InjectionFinding[] {
  const text = textOf(sample);
  return runInjectionCheck(
    { text, origin: 'local', trigger: 'manual' },
    collectDocumentStructure(text),
    ruleset,
  ).findings;
}

function isFound(sample: Sample, expected: ExpectedFinding): boolean {
  return findingsOf(sample).some(
    (finding) => finding.ruleId === expected.ruleId && isAtLeast(finding.severity, expected.minSeverity),
  );
}

function expectationsOf(group: string) {
  return corpus.malicious.flatMap((sample) =>
    (sample.expected ?? [])
      .filter(({ ruleId }) => ruleId.startsWith(group))
      .map((expected) => ({ sample, expected })),
  );
}

describe('Markdown corpus scorecard', () => {
  it('finds every hidden content sample', () => {
    const misses = expectationsOf('hidden-').filter(({ sample, expected }) => !isFound(sample, expected));

    expect(misses.map(({ sample, expected }) => `${sample.id}: ${expected.ruleId}`)).toEqual([]);
  });

  it('finds every look-alike address sample', () => {
    const misses = expectationsOf('char-confusable').filter(
      ({ sample, expected }) => !isFound(sample, expected),
    );

    expect(misses.map(({ sample }) => sample.id)).toEqual([]);
  });

  it(`finds at least ${String(EXFILTRATION_DETECTION_TARGET * 100)}% of the address samples`, () => {
    const expectations = expectationsOf('exfil-');

    const foundCount = expectations.filter(({ sample, expected }) => isFound(sample, expected)).length;

    expect(foundCount / expectations.length).toBeGreaterThanOrEqual(EXFILTRATION_DETECTION_TARGET);
  });

  it('reports no hidden styles, hidden attributes, removed elements or look-alike hosts at Medium on harmless samples', () => {
    const falseAlarms = corpus.harmless.flatMap((sample) =>
      findingsOf(sample)
        .filter((finding) => ZERO_MEDIUM_RULES.has(finding.ruleId) && isAtLeast(finding.severity, 'medium'))
        .map((finding) => `${sample.id}: ${finding.ruleId}`),
    );

    expect(falseAlarms).toEqual([]);
  });

  it('reports no address finding at High, and Medium on at most 2% of harmless samples', () => {
    const addressFindings = corpus.harmless.map((sample) =>
      findingsOf(sample).filter((finding) => finding.ruleId.startsWith('exfil-')),
    );

    const highs = addressFindings.flat().filter((finding) => finding.severity === 'high');
    const samplesWithMedium = addressFindings.filter((findings) =>
      findings.some((finding) => isAtLeast(finding.severity, 'medium')),
    );

    expect(highs).toEqual([]);
    expect(samplesWithMedium.length / corpus.harmless.length).toBeLessThanOrEqual(
      MAX_SHARE_OF_HARMLESS_WITH_MEDIUM,
    );
  });

  it('uses only reserved names in every sample address', () => {
    const hosts = [...corpus.malicious, ...corpus.harmless].flatMap((sample) =>
      [...textOf(sample).matchAll(ADDRESS)].map((match) => new URL(`https://${match[1] ?? ''}`).hostname),
    );

    expect(hosts.filter((host) => !RESERVED_HOST.test(host))).toEqual([]);
  });
});
