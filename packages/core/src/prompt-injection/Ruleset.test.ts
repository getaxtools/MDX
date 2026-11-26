import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import bundledRulesetData from './rules/ruleset.json' with { type: 'json' };
import { Ruleset, RulesetError } from './Ruleset';

const ENGLISH_CATALOG_FILE = join(import.meta.dirname, '..', '..', '..', 'i18n', 'locales', 'en.json');

const validRule = {
  id: 'char-sample',
  group: 'characters',
  kind: 'codepoints',
  severity: 'medium',
  appliesTo: 'allDocuments',
  titleKey: 'promptInjection.rule.charSample.title',
  explanationKey: 'promptInjection.rule.charSample.explanation',
  escalation: { agentFile: 1 },
  parameters: { minimumRunLength: 2 },
};

function rulesetWith(overrides: Record<string, unknown>): Record<string, unknown> {
  return { version: '1.0.0', renamedRules: {}, codepointSets: {}, rules: [validRule], ...overrides };
}

function englishCatalogKeys(): Set<string> {
  return new Set(
    Object.keys(JSON.parse(readFileSync(ENGLISH_CATALOG_FILE, 'utf8')) as Record<string, string>),
  );
}

describe('Ruleset', () => {
  it('loads the bundled rules', () => {
    const ruleset = Ruleset.bundled();

    expect(ruleset.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(ruleset.rules().length).toBeGreaterThan(0);
  });

  it('gives every bundled rule a unique id', () => {
    const ids = bundledRulesetData.rules.map((rule) => rule.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('names catalog keys that exist in the English catalog', () => {
    const catalogKeys = englishCatalogKeys();

    const missingKeys = Ruleset.bundled()
      .rules()
      .flatMap((rule) => [rule.titleKey, rule.explanationKey])
      .filter((key) => !catalogKeys.has(key));

    expect(missingKeys).toEqual([]);
  });

  it.each([
    ['an unknown severity', { severity: 'critical' }],
    ['an unknown matcher kind', { kind: 'magic' }],
    ['an id that does not match its group', { group: 'hidden' }],
    ['an id with capital letters', { id: 'char-Sample' }],
    ['a catalog key outside the feature', { titleKey: 'menu.file' }],
    ['an escalation of more than three steps', { escalation: { hidden: 4 } }],
    ['an unknown escalation context', { escalation: { daylight: 1 } }],
    ['a negative number parameter', { parameters: { minimumRunLength: -1 } }],
    ['missing parameters', { parameters: undefined }],
  ])('rejects a rule with %s', (_description, override) => {
    const data = rulesetWith({ rules: [{ ...validRule, ...override }] });

    expect(() => Ruleset.parse(data)).toThrow(RulesetError);
  });

  it('rejects two rules with the same id', () => {
    const data = rulesetWith({ rules: [validRule, validRule] });

    expect(() => Ruleset.parse(data)).toThrow(expect.objectContaining({ problem: 'duplicateRuleId' }));
  });

  it('rejects a version that is not semver', () => {
    expect(() => Ruleset.parse(rulesetWith({ version: '1.0' }))).toThrow(RulesetError);
  });

  it('rejects a malformed code point set', () => {
    const data = rulesetWith({ codepointSets: { broken: ['U+ZZZZ'] } });

    expect(() => Ruleset.parse(data)).toThrow(expect.objectContaining({ problem: 'invalidCodepointSet' }));
  });

  it('follows renamed rules so ignore entries saved under an old id keep applying', () => {
    const ruleset = Ruleset.parse(
      rulesetWith({ renamedRules: { 'char-oldest': 'char-old', 'char-old': 'char-sample' } }),
    );

    expect(ruleset.currentRuleIdOf('char-oldest')).toBe('char-sample');
    expect(ruleset.currentRuleIdOf('char-sample')).toBe('char-sample');
  });

  it.each([
    ['a rename to a rule that does not exist', { 'char-old': 'char-missing' }],
    ['a rename of a rule that still exists', { 'char-sample': 'char-sample' }],
    ['a rename cycle', { 'char-a': 'char-b', 'char-b': 'char-a' }],
  ])('rejects %s', (_description, renamedRules) => {
    expect(() => Ruleset.parse(rulesetWith({ renamedRules }))).toThrow(
      expect.objectContaining({ problem: 'invalidRename' }),
    );
  });

  it('reports a missing rule or code point set by name', () => {
    const ruleset = Ruleset.parse(rulesetWith({}));

    expect(() => ruleset.rule('char-missing')).toThrow(expect.objectContaining({ subject: 'char-missing' }));
    expect(() => ruleset.codepointSet('missing')).toThrow(RulesetError);
  });
});
