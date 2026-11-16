import { CodePointSet, InvalidCodePointNotationError } from './CodePointSet';
import type { SeverityEscalation } from './escalateSeverity';
import { isInjectionSeverity, type InjectionSeverity } from './injectionSeverity';
import hostLists from './rules/hosts.json' with { type: 'json' };
import htmlElementLists from './rules/html-elements.json' with { type: 'json' };
import bundledRulesetData from './rules/ruleset.json' with { type: 'json' };
import toolMarkerLists from './rules/tool-markers.json' with { type: 'json' };

export type RuleGroup = 'characters' | 'hidden' | 'instructions' | 'exfiltration' | 'agentFiles';
export type MatcherKind = 'codepoints' | 'phrases' | 'urlShape' | 'structure' | 'command' | 'decoder';
export type RuleAudience = 'allDocuments' | 'agentFiles';
export type RuleParameter = number | string | readonly string[];

export interface InjectionRule {
  readonly id: string;
  readonly group: RuleGroup;
  readonly kind: MatcherKind;
  readonly severity: InjectionSeverity;
  readonly appliesTo: RuleAudience;
  readonly titleKey: string;
  readonly explanationKey: string;
  readonly escalation: SeverityEscalation;
  readonly parameters: Readonly<Record<string, RuleParameter>>;
}

export type RulesetProblem =
  | 'notAnObject'
  | 'invalidVersion'
  | 'invalidRule'
  | 'duplicateRuleId'
  | 'invalidCodepointSet'
  | 'invalidRename'
  | 'missingRule'
  | 'invalidParameter'
  | 'invalidList';

export class RulesetError extends Error {
  constructor(
    readonly problem: RulesetProblem,
    readonly subject: string,
  ) {
    super(`Ruleset ${problem}: ${subject}`);
    this.name = 'RulesetError';
  }
}

const SEMVER = /^\d+\.\d+\.\d+$/;
const RULE_ID = /^(char|hidden|instr|exfil|agent)(-[a-z0-9]+)+$/;
const CATALOG_KEY = /^promptInjection\.rule\.[a-z][a-zA-Z0-9]*\.(title|explanation)$/;
const GROUP_OF_PREFIX: Readonly<Record<string, RuleGroup>> = {
  char: 'characters',
  hidden: 'hidden',
  instr: 'instructions',
  exfil: 'exfiltration',
  agent: 'agentFiles',
};
const MATCHER_KINDS: readonly MatcherKind[] = [
  'codepoints',
  'phrases',
  'urlShape',
  'structure',
  'command',
  'decoder',
];
const RULE_AUDIENCES: readonly RuleAudience[] = ['allDocuments', 'agentFiles'];
const ESCALATION_CONTEXTS: readonly (keyof SeverityEscalation)[] = [
  'hidden',
  'agentFile',
  'codeExample',
  'negated',
];
const MAX_ESCALATION_STEPS = 3;
const MAX_RENAME_HOPS = 16;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function oneOf<Value extends string>(value: unknown, allowed: readonly Value[]): value is Value {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

function isStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function parseEscalation(value: unknown, ruleId: string): SeverityEscalation {
  if (!isRecord(value)) throw new RulesetError('invalidRule', ruleId);
  const entries = Object.entries(value);
  const isValid = entries.every(
    ([context, steps]) =>
      oneOf(context, ESCALATION_CONTEXTS) &&
      Number.isInteger(steps) &&
      Math.abs(steps as number) <= MAX_ESCALATION_STEPS,
  );
  if (!isValid) throw new RulesetError('invalidRule', ruleId);
  return value;
}

function parseParameters(value: unknown, ruleId: string): Readonly<Record<string, RuleParameter>> {
  if (!isRecord(value)) throw new RulesetError('invalidRule', ruleId);
  const isValid = Object.values(value).every(
    (parameter) =>
      (typeof parameter === 'number' && Number.isFinite(parameter) && parameter >= 0) ||
      typeof parameter === 'string' ||
      isStringList(parameter),
  );
  if (!isValid) throw new RulesetError('invalidParameter', ruleId);
  return value as Readonly<Record<string, RuleParameter>>;
}

type UnknownRecord = Readonly<Record<string, unknown>>;

function hasValidIdentity(record: UnknownRecord): record is UnknownRecord & { id: string; group: RuleGroup } {
  const { id, group } = record;
  if (typeof id !== 'string' || !RULE_ID.test(id)) return false;
  return GROUP_OF_PREFIX[id.split('-')[0] ?? ''] === group;
}

function hasValidCatalogKeys(record: Readonly<Record<string, unknown>>): boolean {
  const { titleKey, explanationKey } = record;
  return (
    typeof titleKey === 'string' &&
    typeof explanationKey === 'string' &&
    CATALOG_KEY.test(titleKey) &&
    CATALOG_KEY.test(explanationKey)
  );
}

function parseRule(value: unknown): InjectionRule {
  if (!isRecord(value) || !hasValidIdentity(value))
    throw new RulesetError('invalidRule', JSON.stringify(value));
  const { id, group, kind, severity, appliesTo, titleKey, explanationKey } = value;
  const isValid =
    oneOf(kind, MATCHER_KINDS) &&
    isInjectionSeverity(severity) &&
    oneOf(appliesTo, RULE_AUDIENCES) &&
    hasValidCatalogKeys(value);
  if (!isValid) throw new RulesetError('invalidRule', id);
  return {
    id,
    group,
    kind,
    severity,
    appliesTo,
    titleKey: titleKey as string,
    explanationKey: explanationKey as string,
    escalation: parseEscalation(value.escalation, id),
    parameters: parseParameters(value.parameters, id),
  };
}

function parseCodepointSets(value: unknown): ReadonlyMap<string, CodePointSet> {
  if (!isRecord(value)) throw new RulesetError('invalidCodepointSet', 'codepointSets');
  return new Map(
    Object.entries(value).map(([name, notations]) => {
      if (!isStringList(notations)) throw new RulesetError('invalidCodepointSet', name);
      try {
        return [name, CodePointSet.fromNotations(notations)];
      } catch (error) {
        if (error instanceof InvalidCodePointNotationError)
          throw new RulesetError('invalidCodepointSet', name);
        throw error;
      }
    }),
  );
}

function parseLists(value: unknown): ReadonlyMap<string, readonly string[]> {
  if (value === undefined) return new Map();
  if (!isRecord(value)) throw new RulesetError('invalidList', 'lists');
  return new Map(
    Object.entries(value).map(([name, items]) => {
      if (!isStringList(items)) throw new RulesetError('invalidList', name);
      return [name, items];
    }),
  );
}

function indexRules(rules: readonly InjectionRule[]): ReadonlyMap<string, InjectionRule> {
  const rulesById = new Map<string, InjectionRule>();
  for (const rule of rules) {
    if (rulesById.has(rule.id)) throw new RulesetError('duplicateRuleId', rule.id);
    rulesById.set(rule.id, rule);
  }
  return rulesById;
}

function parseRenamedRules(
  value: unknown,
  rulesById: ReadonlyMap<string, InjectionRule>,
): Readonly<Record<string, string>> {
  if (!isRecord(value)) throw new RulesetError('invalidRename', 'renamedRules');
  for (const [oldId, newId] of Object.entries(value)) {
    if (typeof newId !== 'string' || rulesById.has(oldId)) throw new RulesetError('invalidRename', oldId);
  }
  const renamedRules = value as Readonly<Record<string, string>>;
  for (const oldId of Object.keys(renamedRules)) {
    if (!rulesById.has(followRenames(renamedRules, oldId))) throw new RulesetError('invalidRename', oldId);
  }
  return renamedRules;
}

function followRenames(renamedRules: Readonly<Record<string, string>>, ruleId: string): string {
  let currentId = ruleId;
  for (let hop = 0; hop < MAX_RENAME_HOPS && Object.hasOwn(renamedRules, currentId); hop += 1)
    currentId = renamedRules[currentId] ?? currentId;
  return currentId;
}

interface RulesetContents {
  readonly version: string;
  readonly rulesById: ReadonlyMap<string, InjectionRule>;
  readonly codepointSets: ReadonlyMap<string, CodePointSet>;
  readonly lists: ReadonlyMap<string, readonly string[]>;
  readonly renamedRules: Readonly<Record<string, string>>;
}

/** The validated rule data: rule records, named code point sets and the map that keeps renamed rules' ignore entries. */
export class Ruleset {
  private static bundledRuleset: Ruleset | undefined;

  readonly version: string;
  private readonly rulesById: ReadonlyMap<string, InjectionRule>;
  private readonly codepointSets: ReadonlyMap<string, CodePointSet>;
  private readonly lists: ReadonlyMap<string, readonly string[]>;
  private readonly renamedRules: Readonly<Record<string, string>>;

  private constructor(contents: RulesetContents) {
    this.version = contents.version;
    this.rulesById = contents.rulesById;
    this.codepointSets = contents.codepointSets;
    this.lists = contents.lists;
    this.renamedRules = contents.renamedRules;
  }

  /** Validates every record; throws a RulesetError naming the first bad one. */
  static parse(data: unknown): Ruleset {
    if (!isRecord(data)) throw new RulesetError('notAnObject', 'ruleset');
    const { version, rules } = data;
    if (typeof version !== 'string' || !SEMVER.test(version))
      throw new RulesetError('invalidVersion', 'version');
    if (!Array.isArray(rules)) throw new RulesetError('invalidRule', 'rules');
    const rulesById = indexRules(rules.map(parseRule));
    const codepointSets = parseCodepointSets(data.codepointSets);
    const renamedRules = parseRenamedRules(data.renamedRules, rulesById);
    return new Ruleset({ version, rulesById, codepointSets, lists: parseLists(data.lists), renamedRules });
  }

  static bundled(): Ruleset {
    Ruleset.bundledRuleset ??= Ruleset.parse(bundledRulesetWithLists());
    return Ruleset.bundledRuleset;
  }

  rules(): readonly InjectionRule[] {
    return [...this.rulesById.values()];
  }

  rule(ruleId: string): InjectionRule {
    const rule = this.rulesById.get(ruleId);
    if (!rule) throw new RulesetError('missingRule', ruleId);
    return rule;
  }

  codepointSet(name: string): CodePointSet {
    const set = this.codepointSets.get(name);
    if (!set) throw new RulesetError('invalidCodepointSet', name);
    return set;
  }

  /** A named list of hosts, element names or markers from the rule data. */
  list(name: string): readonly string[] {
    const items = this.lists.get(name);
    if (!items) throw new RulesetError('invalidList', name);
    return items;
  }

  /** The id a rule has in this ruleset, following renames, so ignore entries saved under an old id still apply. */
  currentRuleIdOf(ruleId: string): string {
    return followRenames(this.renamedRules, ruleId);
  }
}

/** The bundled rule records with the host, element and marker lists that ship beside them. */
export function bundledRulesetWithLists(): Readonly<Record<string, unknown>> {
  return { ...bundledRulesetData, lists: { ...hostLists, ...htmlElementLists, ...toolMarkerLists } };
}

export function numberParameter(rule: InjectionRule, name: string): number {
  const value = rule.parameters[name];
  if (typeof value !== 'number') throw new RulesetError('invalidParameter', `${rule.id}.${name}`);
  return value;
}

export function severityParameter(rule: InjectionRule, name: string): InjectionSeverity {
  const value = rule.parameters[name];
  if (!isInjectionSeverity(value)) throw new RulesetError('invalidParameter', `${rule.id}.${name}`);
  return value;
}
