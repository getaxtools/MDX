import type { StructuralFinding, StructuralRule } from '@mdx/core';
import type { MessageKey, Translator } from '@mdx/i18n';

const RULE_MESSAGE_KEYS: Readonly<Record<StructuralRule, MessageKey>> = {
  deltaFileWithoutSections: 'specViewer.rule.deltaFileWithoutSections',
  deltaSectionsWithoutRequirements: 'specViewer.rule.deltaSectionsWithoutRequirements',
  deltaFileAtSpecsRoot: 'specViewer.rule.deltaFileAtSpecsRoot',
  deltaFileNotNamedSpec: 'specViewer.rule.deltaFileNotNamedSpec',
  requirementUnderUnknownSection: 'specViewer.rule.requirementUnderUnknownSection',
  duplicateRequirement: 'specViewer.rule.duplicateRequirement',
  duplicateRename: 'specViewer.rule.duplicateRename',
  requirementInTwoSections: 'specViewer.rule.requirementInTwoSections',
  modifiedUsesRenamedName: 'specViewer.rule.modifiedUsesRenamedName',
  renameCollidesWithAdded: 'specViewer.rule.renameCollidesWithAdded',
  unpairedRename: 'specViewer.rule.unpairedRename',
  requirementWithoutText: 'specViewer.rule.requirementWithoutText',
  requirementWithoutScenario: 'specViewer.rule.requirementWithoutScenario',
  modifiedDropsScenario: 'specViewer.rule.modifiedDropsScenario',
  changeWithoutDeltas: 'specViewer.rule.changeWithoutDeltas',
  skipSpecsWithDeltaFiles: 'specViewer.rule.skipSpecsWithDeltaFiles',
  skipSpecsWithInvalidMetadata: 'specViewer.rule.skipSpecsWithInvalidMetadata',
  requirementWithoutShallOrMust: 'specViewer.rule.requirementWithoutShallOrMust',
  addedRequirementTooLong: 'specViewer.rule.addedRequirementTooLong',
  scenarioWithoutSteps: 'specViewer.rule.scenarioWithoutSteps',
  tasksWithoutCheckboxes: 'specViewer.rule.tasksWithoutCheckboxes',
  taskOutsideItsGroup: 'specViewer.rule.taskOutsideItsGroup',
  duplicateTaskNumber: 'specViewer.rule.duplicateTaskNumber',
  purposeTooShort: 'specViewer.rule.purposeTooShort',
  purposeIsPlaceholder: 'specViewer.rule.purposeIsPlaceholder',
  requirementTooLong: 'specViewer.rule.requirementTooLong',
  unknownMetadataKey: 'specViewer.rule.unknownMetadataKey',
};

/** The second name a message quotes, written the way the spec documents write it. */
function sectionOf(finding: StructuralFinding): string {
  const detail = finding.detail ?? '';
  if (finding.rule === 'requirementInTwoSections') return detail.toUpperCase().split(',').join(' and ');
  if (finding.rule === 'modifiedDropsScenario')
    return detail
      .split('\n')
      .map((name) => `"${name}"`)
      .join(', ');
  return detail;
}

export function findingMessageOf(finding: StructuralFinding, translator: Translator): string {
  return translator.translate(RULE_MESSAGE_KEYS[finding.rule], {
    name: finding.subject ?? '',
    section: sectionOf(finding),
  });
}
