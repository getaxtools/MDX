import { describe, expect, it } from 'vitest';
import { Phrasebook } from './Phrasebook';
import { Ruleset } from './Ruleset';

const ADVERSARIAL_LENGTH = 100_000;
const TIME_BUDGET_MS = 250;
const DATA_PATTERN_LISTS = [
  'pipeToShellPatterns',
  'agentPathPatterns',
  'externalImportPatterns',
  'broadGrantPatterns',
  'selfPropagationPatterns',
];

function repeatedTo(unit: string): string {
  return unit.repeat(Math.ceil(ADVERSARIAL_LENGTH / unit.length)).slice(0, ADVERSARIAL_LENGTH);
}

const ADVERSARIAL_INPUTS = [
  'a',
  ' ',
  'ignore ',
  'ignore all the ',
  'disregard the previous ',
  'do not tell the ',
  'read x ',
  'fetch the instructions ',
  'run the ',
  'curl x ',
  'iwr x ',
  '<|',
  '{ "name": "',
  '@~/',
  '/',
  '\\',
  'add to ',
  'system: ',
  '--',
].map(repeatedTo);

function dataPatterns(): { name: string; pattern: RegExp }[] {
  const ruleset = Ruleset.bundled();
  const phrases = Phrasebook.english().phrases.map(({ ruleId, pattern }) => ({
    name: `${ruleId} ${pattern.source}`,
    pattern,
  }));
  const lists = DATA_PATTERN_LISTS.flatMap((list) =>
    ruleset.list(list).map((source) => ({ name: `${list} ${source}`, pattern: new RegExp(source, 'giu') })),
  );
  return [...phrases, ...lists];
}

describe('regular expressions in the rule data', () => {
  it.each(dataPatterns())(
    `finish on ${String(ADVERSARIAL_LENGTH)}-character adversarial input within budget: $name`,
    ({ pattern }) => {
      const startedAt = performance.now();

      for (const input of ADVERSARIAL_INPUTS) Array.from(input.matchAll(pattern));

      expect(performance.now() - startedAt).toBeLessThan(TIME_BUDGET_MS * ADVERSARIAL_INPUTS.length);
    },
  );
});
