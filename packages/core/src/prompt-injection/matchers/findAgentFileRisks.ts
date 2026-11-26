import type { SourceRange } from '../DocumentStructure';
import { MatchingText } from '../MatchingText';
import { latinLetterMap } from '../Phrasebook';
import { numberParameter, severityParameter, type Ruleset } from '../Ruleset';
import { hasInstructionPhrase } from './findInstructionPhrases';
import type { DocumentRuleInput, RuleMatch } from './RuleMatch';
import { hiddenCharactersOf } from './scanHiddenCharacters';

const IMPORT_RULE_ID = 'agent-external-import';
const GRANT_RULE_ID = 'agent-broad-tool-grant';
const DESCRIPTION_RULE_ID = 'agent-description-instructions';
const PROPAGATION_RULE_ID = 'agent-self-propagation';
const ALWAYS_LOADED_RULE_ID = 'agent-always-loaded';
const FRONT_MATTER_KEY = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/;
const TOOL_GRANT = /\b([A-Za-z]+)\b(?:\(([^)]*)\))?/g;
const ALWAYS_APPLY = /^alwaysApply\s*:\s*true\s*$/i;
const MATCH_ALL_GLOBS = /^globs\s*:\s*["']?(?:\*\*\/\*|\*\*|\*)["']?\s*$/i;
const BLOCK_SCALAR = /^[>|][+-]?$/;

const compiledLists = new WeakMap<Ruleset, ReadonlyMap<string, readonly RegExp[]>>();

function patternsOf(ruleset: Ruleset, listName: string): readonly RegExp[] {
  let lists = compiledLists.get(ruleset);
  if (!lists) {
    lists = new Map(
      ['externalImportPatterns', 'broadGrantPatterns', 'selfPropagationPatterns'].map((name) => [
        name,
        ruleset.list(name).map((pattern) => new RegExp(pattern, 'giu')),
      ]),
    );
    compiledLists.set(ruleset, lists);
  }
  return lists.get(listName) ?? [];
}

function rangesOfPatterns(text: string, patterns: readonly RegExp[]): SourceRange[] {
  return patterns.flatMap((pattern) =>
    [...text.matchAll(pattern)].map((match) => ({ from: match.index, to: match.index + match[0].length })),
  );
}

/** `@~/notes.md` and other imports that reach outside the project; imports shown in code are skipped. */
export function findExternalImports(input: DocumentRuleInput): RuleMatch[] {
  const severity = input.ruleset.rule(IMPORT_RULE_ID).severity;
  return rangesOfPatterns(input.text, patternsOf(input.ruleset, 'externalImportPatterns'))
    .map((range) => ({ ...range, from: input.text.indexOf('@', range.from) }))
    .filter((range) => !input.lookup.isInCode(range.from))
    .map((range) => ({ ruleId: IMPORT_RULE_ID, ...range, severity }));
}

interface FrontMatterEntry {
  readonly key: string;
  /** The value, with the indented lines of a block or list that follow the key. */
  readonly value: string;
  readonly range: SourceRange;
}

/** The keys of YAML-like front matter, each with its value lines; not a full YAML reader, which no rule needs. */
function frontMatterEntriesOf(input: DocumentRuleInput): FrontMatterEntry[] {
  const frontMatter = input.structure.segments.find((segment) => segment.kind === 'frontMatter');
  if (!frontMatter) return [];
  const entries: { key: string; lines: string[]; from: number; to: number }[] = [];
  const lastLine = input.positions.lineOf(frontMatter.range.to);
  for (
    let lineNumber = input.positions.lineOf(frontMatter.range.from);
    lineNumber <= lastLine;
    lineNumber += 1
  ) {
    const from = input.positions.lineStart(lineNumber);
    const to = input.positions.lineEnd(lineNumber);
    const line = input.text.slice(from, to);
    const key = /^\s/.test(line) ? undefined : FRONT_MATTER_KEY.exec(line);
    const current = entries.at(-1);
    if (key?.[1] !== undefined) entries.push({ key: key[1], lines: [key[2] ?? ''], from, to });
    else if (current && /^\s/.test(line)) {
      current.lines.push(line.trim());
      current.to = to;
    }
  }
  return entries.map(({ key, lines, from, to }) => ({
    key: key.toLowerCase(),
    value: lines
      .filter((line) => !BLOCK_SCALAR.test(line))
      .join(' ')
      .trim(),
    range: { from, to },
  }));
}

/** `Bash`, `Bash(*)` or `Bash(curl:*)` grant any command; `Bash(git status:*)` is narrow. */
function isBroadGrant(ruleset: Ruleset, value: string): boolean {
  const shellTools = ruleset.list('shellToolNames');
  const riskyCommands = ruleset.list('riskyGrantCommands');
  return [...value.matchAll(TOOL_GRANT)].some(([, tool, scope]) => {
    if (tool === undefined || !shellTools.includes(tool.toLowerCase())) return false;
    const command = (scope ?? '').trim().replace(/^:/, '').split(/[\s:]/)[0] ?? '';
    return scope === undefined || command === '' || riskyCommands.includes(command.toLowerCase());
  });
}

export function findBroadToolGrants(input: DocumentRuleInput): RuleMatch[] {
  const severity = input.ruleset.rule(GRANT_RULE_ID).severity;
  const frontMatterGrants = frontMatterEntriesOf(input)
    .filter((entry) => entry.key === 'allowed-tools' && isBroadGrant(input.ruleset, entry.value))
    .map((entry) => entry.range);
  const settingsGrants = rangesOfPatterns(input.text, patternsOf(input.ruleset, 'broadGrantPatterns'));
  return [...frontMatterGrants, ...settingsGrants].map((range) => ({
    ruleId: GRANT_RULE_ID,
    ...range,
    severity,
  }));
}

/** A skill or rule description is loaded for every task, so it must describe, not instruct. */
export function findDescriptionInstructions(input: DocumentRuleInput): RuleMatch[] {
  const rule = input.ruleset.rule(DESCRIPTION_RULE_ID);
  const maxLength = numberParameter(rule, 'maxDescriptionLength');
  return frontMatterEntriesOf(input)
    .filter((entry) => entry.key === 'description')
    .filter((entry) => entry.value.length > maxLength || hasInstructionPhrase(input, entry.value))
    .map((entry) => ({ ruleId: DESCRIPTION_RULE_ID, ...entry.range, severity: rule.severity }));
}

/** Instructions to write to other agent files, Git hooks or shell start-up files, so they spread. */
export function findSelfPropagation(input: DocumentRuleInput): RuleMatch[] {
  const rule = input.ruleset.rule(PROPAGATION_RULE_ID);
  const matching = MatchingText.of(input.text, {
    ignorable: hiddenCharactersOf(input.ruleset),
    latinLetterOf: latinLetterMap(),
  });
  return rangesOfPatterns(matching.text, patternsOf(input.ruleset, 'selfPropagationPatterns')).map((hit) => {
    const range = matching.sourceRangeOf(hit.from, hit.to);
    const severity = input.lookup.isInCode(range.from)
      ? severityParameter(rule, 'codeSeverity')
      : rule.severity;
    return { ruleId: PROPAGATION_RULE_ID, ...range, severity };
  });
}

export function findAlwaysLoadedRules(input: DocumentRuleInput): RuleMatch[] {
  const severity = input.ruleset.rule(ALWAYS_LOADED_RULE_ID).severity;
  return frontMatterEntriesOf(input)
    .filter((entry) => {
      const line = input.text.slice(entry.range.from, entry.range.to).split(/\r\n|\r|\n/)[0] ?? '';
      return ALWAYS_APPLY.test(line) || MATCH_ALL_GLOBS.test(line);
    })
    .map((entry) => ({ ruleId: ALWAYS_LOADED_RULE_ID, ...entry.range, severity }));
}
