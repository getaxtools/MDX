import type { MainSpec } from './parseMainSpec';
import type { DeltaSpec } from './parseDeltaSpec';
import { scenariosOf, type RequirementBlock } from './requirementBlocks';
import { findingOf, type StructuralFinding } from './structuralFindings';

/** Names the current block has that the incoming block lacks, counting repeated names separately. */
export function missingScenarioNames(current: RequirementBlock, incoming: RequirementBlock): string[] {
  const remaining = new Map<string, number>();
  for (const scenario of scenariosOf(incoming))
    remaining.set(scenario.name, (remaining.get(scenario.name) ?? 0) + 1);
  return scenariosOf(current).flatMap((scenario) => {
    const left = remaining.get(scenario.name) ?? 0;
    if (left === 0) return [scenario.name];
    remaining.set(scenario.name, left - 1);
    return [];
  });
}

/** The current block a MODIFIED name lands on, following renames back to the name the spec still has. */
function currentBlockFor(
  name: string,
  currentBlocks: ReadonlyMap<string, RequirementBlock>,
  renamedFrom: ReadonlyMap<string, string>,
): RequirementBlock | undefined {
  const visited = new Set<string>();
  let key: string | undefined = name;
  while (key !== undefined && !visited.has(key)) {
    const block = currentBlocks.get(key);
    if (block) return block;
    visited.add(key);
    key = renamedFrom.get(key);
  }
  return undefined;
}

/** MODIFIED requirements that drop a scenario the current spec has, which archiving would refuse. */
export function checkScenarioLoss(path: string, delta: DeltaSpec, current: MainSpec): StructuralFinding[] {
  const currentBlocks = new Map(current.requirements.map((block) => [block.name, block]));
  const renamedFrom = new Map(delta.renamed.map(({ from, to }) => [to.name, from.name]));
  const renamedAway = new Set(delta.renamed.map(({ from }) => from.name));
  return delta.modified.flatMap((block) => {
    if (renamedAway.has(block.name)) return [];
    const currentBlock = currentBlockFor(block.name, currentBlocks, renamedFrom);
    const missing = currentBlock ? missingScenarioNames(currentBlock, block) : [];
    if (missing.length === 0) return [];
    return [
      findingOf('modifiedDropsScenario', {
        path,
        line: block.line,
        subject: block.name,
        detail: missing.join('\n'),
      }),
    ];
  });
}
