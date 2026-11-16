export type FindingSeverity = 'error' | 'warning';

/** The structural rules the spec viewer checks: a named subset of the spec tool 2.0.0 rules. */
export type StructuralRule =
  | 'deltaFileWithoutSections'
  | 'deltaSectionsWithoutRequirements'
  | 'deltaFileAtSpecsRoot'
  | 'deltaFileNotNamedSpec'
  | 'requirementUnderUnknownSection'
  | 'duplicateRequirement'
  | 'duplicateRename'
  | 'requirementInTwoSections'
  | 'modifiedUsesRenamedName'
  | 'renameCollidesWithAdded'
  | 'unpairedRename'
  | 'requirementWithoutText'
  | 'requirementWithoutScenario'
  | 'modifiedDropsScenario'
  | 'changeWithoutDeltas'
  | 'skipSpecsWithDeltaFiles'
  | 'skipSpecsWithInvalidMetadata'
  | 'requirementWithoutShallOrMust'
  | 'addedRequirementTooLong'
  | 'scenarioWithoutSteps'
  | 'tasksWithoutCheckboxes'
  | 'taskOutsideItsGroup'
  | 'duplicateTaskNumber'
  | 'purposeTooShort'
  | 'purposeIsPlaceholder'
  | 'requirementTooLong'
  | 'unknownMetadataKey';

export const RULE_SEVERITIES: Readonly<Record<StructuralRule, FindingSeverity>> = {
  deltaFileWithoutSections: 'error',
  deltaSectionsWithoutRequirements: 'error',
  deltaFileAtSpecsRoot: 'error',
  deltaFileNotNamedSpec: 'error',
  requirementUnderUnknownSection: 'error',
  duplicateRequirement: 'error',
  duplicateRename: 'error',
  requirementInTwoSections: 'error',
  modifiedUsesRenamedName: 'error',
  renameCollidesWithAdded: 'error',
  unpairedRename: 'error',
  requirementWithoutText: 'error',
  requirementWithoutScenario: 'error',
  modifiedDropsScenario: 'error',
  changeWithoutDeltas: 'error',
  skipSpecsWithDeltaFiles: 'error',
  skipSpecsWithInvalidMetadata: 'error',
  requirementWithoutShallOrMust: 'warning',
  addedRequirementTooLong: 'warning',
  scenarioWithoutSteps: 'warning',
  tasksWithoutCheckboxes: 'warning',
  taskOutsideItsGroup: 'warning',
  duplicateTaskNumber: 'warning',
  purposeTooShort: 'warning',
  purposeIsPlaceholder: 'warning',
  requirementTooLong: 'warning',
  unknownMetadataKey: 'warning',
};

/** The longest requirement description the spec tool accepts without a warning. */
export const MAX_REQUIREMENT_TEXT_LENGTH = 500;
export const MIN_PURPOSE_LENGTH = 50;

export interface StructuralFinding {
  readonly rule: StructuralRule;
  readonly severity: FindingSeverity;
  /** The document the finding is in: relative to the change folder, or the spec's own file name. */
  readonly path: string;
  /** Counted from 1; undefined for a finding about the whole document or change. */
  readonly line?: number | undefined;
  /** What the message names: a requirement, scenario, task number, section or key. */
  readonly subject?: string | undefined;
  /** A second name for the message, such as the other section or the missing parts. */
  readonly detail?: string | undefined;
}

export type FindingPlace = Omit<StructuralFinding, 'rule' | 'severity'>;

export function findingOf(rule: StructuralRule, place: FindingPlace): StructuralFinding {
  return { rule, severity: RULE_SEVERITIES[rule], ...place };
}

/** Whether findings fail a check; with Strict on, warnings fail it too, as the tool's strict mode does. */
export function failsCheck(findings: readonly StructuralFinding[], isStrict: boolean): boolean {
  return findings.some((finding) => finding.severity === 'error' || isStrict);
}
