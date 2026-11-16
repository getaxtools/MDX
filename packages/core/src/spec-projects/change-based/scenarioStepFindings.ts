import { scenariosOf, type RequirementBlock } from './requirementBlocks';
import { findingOf, type StructuralFinding } from './structuralFindings';

/** Labelled scenarios with text but no WHEN or GIVEN step, or no THEN step. */
export function scenarioStepFindings(path: string, block: RequirementBlock): StructuralFinding[] {
  return scenariosOf(block).flatMap((scenario) => {
    const isChecked = scenario.hasStepLines && scenario.isLabelledScenario;
    if (!isChecked || (scenario.hasTriggerStep && scenario.hasOutcomeStep)) return [];
    const missing = [!scenario.hasTriggerStep && 'trigger', !scenario.hasOutcomeStep && 'outcome'].filter(
      Boolean,
    );
    return [
      findingOf('scenarioWithoutSteps', {
        path,
        line: scenario.line,
        subject: scenario.name,
        detail: missing.join(','),
      }),
    ];
  });
}
