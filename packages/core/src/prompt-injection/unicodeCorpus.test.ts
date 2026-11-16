import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DocumentSegment, SourceRange } from './DocumentStructure';
import type { InjectionFinding } from './InjectionCheck';
import { isAtLeast, type InjectionSeverity } from './injectionSeverity';
import { hiddenCharactersOf } from './matchers/scanHiddenCharacters';
import { Ruleset } from './Ruleset';
import { runInjectionCheck } from './runInjectionCheck';

const REPOSITORY_ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const CORPUS_FOLDER = join(REPOSITORY_ROOT, 'tests', 'fixtures', 'prompt-injection');
const LOCALES_FOLDER = join(REPOSITORY_ROOT, 'packages', 'i18n', 'locales');
const RANGE_START = '⟦';
const RANGE_END = '⟧';

type SampleContext = 'prose' | 'code' | 'math' | 'linkText' | 'address';

interface ExpectedFinding {
  readonly ruleId: string;
  readonly minSeverity: InjectionSeverity;
}

interface EscapedSample {
  readonly id: string;
  readonly text: string;
  readonly context?: SampleContext;
  readonly expected?: readonly ExpectedFinding[];
}

interface UnicodeCorpus {
  readonly malicious: readonly EscapedSample[];
  readonly harmless: readonly EscapedSample[];
}

const corpus = JSON.parse(readFileSync(join(CORPUS_FOLDER, 'unicode-samples.json'), 'utf8')) as UnicodeCorpus;

function asTagCharacters(ascii: string): string {
  return Array.from(ascii, (character) =>
    String.fromCodePoint(0xe0000 + (character.codePointAt(0) ?? 0)),
  ).join('');
}

function asVariationSelectors(text: string): string {
  return [...new TextEncoder().encode(text)]
    .map((byte) => String.fromCodePoint(byte < 16 ? 0xfe00 + byte : 0xe0100 + byte - 16))
    .join('');
}

/** Builds the real text from its escaped form, and the ranges marked with double brackets. */
function buildSample(escaped: string): { text: string; expectedRanges: SourceRange[] } {
  const expanded = escaped
    .replace(/\\u\{([0-9A-Fa-f]{1,6})\}/g, (_match, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/\\tags\{([^}]*)\}/g, (_match, ascii: string) => asTagCharacters(ascii))
    .replace(/\\vs\{([^}]*)\}/g, (_match, text: string) => asVariationSelectors(text));
  let text = '';
  const expectedRanges: SourceRange[] = [];
  let rangeStart = 0;
  for (const character of expanded) {
    if (character === RANGE_START) rangeStart = text.length;
    else if (character === RANGE_END) expectedRanges.push({ from: rangeStart, to: text.length });
    else text += character;
  }
  return { text, expectedRanges };
}

function segmentsFor(context: SampleContext | undefined, length: number): DocumentSegment[] {
  const range = { from: 0, to: length };
  if (context === 'code') return [{ kind: 'codeBlock', range, language: 'sh' }];
  if (context === 'math') return [{ kind: 'math', range }];
  if (context === 'linkText') return [{ kind: 'link', range, destination: '', textRange: range }];
  if (context === 'address') return [{ kind: 'link', range, destination: '', destinationRange: range }];
  return [];
}

function findingsOfSample(sample: EscapedSample) {
  const { text, expectedRanges } = buildSample(sample.text);
  const structure = { segments: segmentsFor(sample.context, text.length) };
  return {
    findings: runInjectionCheck({ text, origin: 'local', trigger: 'manual' }, structure).findings,
    expectedRanges,
  };
}

function missesOf(sample: EscapedSample): string[] {
  const { findings, expectedRanges } = findingsOfSample(sample);
  if (expectedRanges.length !== (sample.expected ?? []).length)
    return [`${sample.id}: ranges and expected differ`];
  return (sample.expected ?? []).flatMap(({ ruleId, minSeverity }, index) => {
    const range = expectedRanges[index];
    const isFound = findings.some(
      (finding) =>
        finding.ruleId === ruleId &&
        finding.from === range?.from &&
        finding.to === range.to &&
        isAtLeast(finding.severity, minSeverity),
    );
    return isFound ? [] : [`${sample.id}: ${ruleId} at ${JSON.stringify(range)}`];
  });
}

function alarmsAtMediumOrAbove(id: string, findings: readonly InjectionFinding[]): string[] {
  return findings
    .filter((finding) => isAtLeast(finding.severity, 'medium'))
    .map((finding) => `${id}: ${finding.ruleId} (${finding.severity}) at ${String(finding.from)}`);
}

function falseAlarmsOf(sample: EscapedSample): string[] {
  return alarmsAtMediumOrAbove(sample.id, findingsOfSample(sample).findings);
}

function filesIn(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

describe('Unicode corpus scorecard', () => {
  it('finds every malicious character sample with its exact range and at least its severity', () => {
    expect(corpus.malicious.flatMap(missesOf)).toEqual([]);
  });

  it('reports nothing at Medium or above on the multilingual harmless samples', () => {
    expect(corpus.harmless.flatMap(falseAlarmsOf)).toEqual([]);
  });

  it('has malicious samples for every character rule that runs on the raw text', () => {
    const sampledRuleIds = new Set(
      corpus.malicious.flatMap((sample) => sample.expected ?? []).map((e) => e.ruleId),
    );
    const characterRuleIds = Ruleset.bundled()
      .rules()
      .filter((rule) => rule.group === 'characters' && !rule.id.startsWith('char-confusable'))
      .map((rule) => rule.id);

    expect(characterRuleIds.filter((ruleId) => !sampledRuleIds.has(ruleId))).toEqual([]);
  });

  it('reports nothing at Medium or above in any of the 16 locale catalogs', () => {
    const falseAlarms = readdirSync(LOCALES_FOLDER).flatMap((file) => {
      const catalog = JSON.parse(readFileSync(join(LOCALES_FOLDER, file), 'utf8')) as Record<string, string>;
      return Object.entries(catalog).flatMap(([key, message]) =>
        alarmsAtMediumOrAbove(
          `${file} ${key}`,
          runInjectionCheck({ text: message, origin: 'local', trigger: 'manual' }).findings,
        ),
      );
    });

    expect(readdirSync(LOCALES_FOLDER)).toHaveLength(16);
    expect(falseAlarms).toEqual([]);
  });

  it('keeps no raw hidden character in the corpus files', () => {
    const hiddenCharacters = hiddenCharactersOf(Ruleset.bundled());

    const filesWithHiddenCharacters = filesIn(CORPUS_FOLDER).filter((file) =>
      Array.from(readFileSync(file, 'utf8')).some((character) =>
        hiddenCharacters.has(character.codePointAt(0) ?? 0),
      ),
    );

    expect(filesWithHiddenCharacters).toEqual([]);
  });
});
