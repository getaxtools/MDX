import { missingScenarioNames } from './checkScenarioLoss';
import { foldedName, refusalBeforeApplying, type DeltaRefusal } from './deltaRefusals';
import { parseDeltaSpec, type DeltaSpec } from './parseDeltaSpec';
import { parseMainSpec } from './parseMainSpec';
import type { RequirementBlock } from './requirementBlocks';
import {
  blockText,
  deltaPurposeOf,
  rebuiltSpec,
  requirementsSectionOf,
  specStructureProblemLine,
} from './requirementsSection';

export interface DeltaApplicationInput {
  /** The capability path, such as `identity/user-auth`. */
  readonly capability: string;
  readonly changeName: string;
  readonly deltaText: string;
  /** The capability's current spec, or undefined when the change creates the capability. */
  readonly currentSpecText?: string | undefined;
}

export interface ChangedRequirement {
  readonly name: string;
  readonly isAdded: boolean;
  readonly isModified: boolean;
  readonly renamedFrom?: string | undefined;
}

/** Something the delta asks for that the spec already reflects, which applying skips. */
export interface SkippedOperation {
  readonly kind: 'removedNotFound' | 'removedFromNewCapability';
  readonly requirement: string;
}

export interface SpecAfterChange {
  readonly text: string;
  readonly isNewCapability: boolean;
  readonly changedRequirements: readonly ChangedRequirement[];
  readonly skipped: readonly SkippedOperation[];
}

export type DeltaApplication =
  | { readonly outcome: 'applied'; readonly spec: SpecAfterChange }
  | { readonly outcome: 'refused'; readonly refusal: DeltaRefusal };

// The two fixed halves of the purpose archiving writes for a new capability without one.
const PLACEHOLDER_PURPOSE_START = 'TBD - created by archiving change ';
const PLACEHOLDER_PURPOSE_END = '. Update Purpose after archive.';

/** The requirements while a delta is applied: blocks by name, and the original order by name. */
interface WorkingSpec {
  readonly blocks: Map<string, RequirementBlock>;
  readonly orderedNames: string[];
  readonly changes: Map<string, ChangedRequirement>;
  readonly skipped: SkippedOperation[];
  readonly isNewCapability: boolean;
}

function sameText(first: RequirementBlock, second: RequirementBlock): boolean {
  return blockText(first).trim() === blockText(second).trim();
}

function nearMatchOf(spec: WorkingSpec, name: string, except?: string): string | undefined {
  const match = [...spec.blocks.keys()].find((key) => key !== except && foldedName(key) === foldedName(name));
  return match === undefined ? undefined : spec.blocks.get(match)?.name;
}

function renamedBlock(block: RequirementBlock, name: string): RequirementBlock {
  return { ...block, name, lines: [`### Requirement: ${name}`, ...block.lines.slice(1)] };
}

function applyRenames(spec: WorkingSpec, delta: DeltaSpec): DeltaRefusal | undefined {
  for (const { from, to } of delta.renamed) {
    const block = spec.blocks.get(from.name);
    if (block === undefined) {
      if (!spec.blocks.has(to.name))
        return { reason: 'renameSourceNotFound', requirement: from.name, line: from.line };
      const misspelled = nearMatchOf(spec, from.name, to.name);
      if (misspelled !== undefined)
        return { reason: 'renameSourceMisspelled', requirement: from.name, detail: misspelled };
      continue;
    }
    if (spec.blocks.has(to.name))
      return { reason: 'renameTargetExists', requirement: to.name, line: to.line };
    const nearTarget = nearMatchOf(spec, to.name, from.name);
    if (nearTarget !== undefined)
      return { reason: 'renameTargetNearMatch', requirement: to.name, detail: nearTarget };
    spec.blocks.delete(from.name);
    spec.blocks.set(to.name, renamedBlock(block, to.name));
    const position = spec.orderedNames.indexOf(from.name);
    if (position !== -1) spec.orderedNames.splice(position, 1, to.name);
    spec.changes.set(to.name, { name: to.name, isAdded: false, isModified: false, renamedFrom: from.name });
  }
  return undefined;
}

function applyRemovals(spec: WorkingSpec, delta: DeltaSpec): DeltaRefusal | undefined {
  for (const { name, line } of delta.removed) {
    if (spec.blocks.delete(name)) continue;
    if (spec.isNewCapability) {
      spec.skipped.push({ kind: 'removedFromNewCapability', requirement: name });
      continue;
    }
    const misspelled = nearMatchOf(spec, name);
    if (misspelled !== undefined)
      return { reason: 'removedMisspelled', requirement: name, detail: misspelled, line };
    spec.skipped.push({ kind: 'removedNotFound', requirement: name });
  }
  return undefined;
}

function applyModifications(spec: WorkingSpec, delta: DeltaSpec): DeltaRefusal | undefined {
  for (const block of delta.modified) {
    const current = spec.blocks.get(block.name);
    if (current === undefined)
      return { reason: 'modifiedNotFound', requirement: block.name, line: block.line };
    const missing = missingScenarioNames(current, block);
    if (missing.length > 0) {
      return {
        reason: 'modifiedDropsScenario',
        requirement: block.name,
        detail: missing.join('\n'),
        line: block.line,
      };
    }
    if (!sameText(current, block)) {
      const earlier = spec.changes.get(block.name);
      spec.changes.set(block.name, {
        name: block.name,
        isAdded: false,
        isModified: true,
        renamedFrom: earlier?.renamedFrom,
      });
    }
    spec.blocks.set(block.name, block);
  }
  return undefined;
}

function applyAdditions(spec: WorkingSpec, delta: DeltaSpec): DeltaRefusal | undefined {
  for (const block of delta.added) {
    const existing = spec.blocks.get(block.name);
    if (existing !== undefined) {
      if (sameText(existing, block)) continue;
      return { reason: 'addedExists', requirement: block.name, line: block.line };
    }
    const nearMatch = nearMatchOf(spec, block.name);
    if (nearMatch !== undefined)
      return { reason: 'addedNearMatch', requirement: block.name, detail: nearMatch, line: block.line };
    spec.blocks.set(block.name, block);
    spec.changes.set(block.name, { name: block.name, isAdded: true, isModified: false });
  }
  return undefined;
}

/** The spec archiving writes for a capability the change creates, carrying the delta's purpose when it reads well. */
function newCapabilitySpec(input: DeltaApplicationInput): string {
  const placeholder = `${PLACEHOLDER_PURPOSE_START}${input.changeName}${PLACEHOLDER_PURPOSE_END}`;
  const skeletonWith = (purpose: string) =>
    `# ${input.capability} Specification\n\n## Purpose\n${purpose}\n\n## Requirements\n`;
  const purpose = deltaPurposeOf(input.deltaText);
  if (purpose === undefined) return skeletonWith(placeholder);
  const skeleton = skeletonWith(purpose);
  const parsed = parseMainSpec(skeleton);
  const isReadable =
    !skeleton.includes('<!--') &&
    specStructureProblemLine(skeleton) === undefined &&
    parsed.requirementsLine !== undefined &&
    (parsed.purpose?.text ?? '') !== '';
  return isReadable ? skeleton : skeletonWith(placeholder);
}

function orderedBlocks(spec: WorkingSpec): RequirementBlock[] {
  const kept = spec.orderedNames.flatMap((name) => spec.blocks.get(name) ?? []);
  const keptNames = new Set(spec.orderedNames);
  return [
    ...kept,
    ...[...spec.blocks.entries()].filter(([name]) => !keptNames.has(name)).map(([, block]) => block),
  ];
}

function applyOperations(spec: WorkingSpec, delta: DeltaSpec): DeltaRefusal | undefined {
  return (
    applyRenames(spec, delta) ??
    applyRemovals(spec, delta) ??
    applyModifications(spec, delta) ??
    applyAdditions(spec, delta)
  );
}

/**
 * Applies a delta to its capability's spec as archiving does: renamed, then removed, then modified, then added
 * requirements, keeping the current order and appending added ones; or says why it cannot be applied.
 */
export function applyDelta(input: DeltaApplicationInput): DeltaApplication {
  const delta = parseDeltaSpec(input.deltaText);
  const isNewCapability = input.currentSpecText === undefined;
  const early =
    refusalBeforeApplying(delta) ??
    (isNewCapability && delta.modified.length + delta.renamed.length > 0
      ? { reason: 'changeOnNewCapability' as const }
      : undefined);
  if (early) return { outcome: 'refused', refusal: early };
  const currentText = input.currentSpecText ?? newCapabilitySpec(input);
  const problemLine = specStructureProblemLine(currentText);
  if (problemLine !== undefined)
    return { outcome: 'refused', refusal: { reason: 'currentSpecInvalid', line: problemLine } };
  const section = requirementsSectionOf(currentText);
  const spec: WorkingSpec = {
    blocks: new Map(section.blocks.map((block) => [block.name, block])),
    orderedNames: section.blocks.map((block) => block.name),
    changes: new Map(),
    skipped: [],
    isNewCapability,
  };
  const refusal = applyOperations(spec, delta);
  if (refusal) return { outcome: 'refused', refusal };
  const text = rebuiltSpec(section, orderedBlocks(spec));
  return {
    outcome: 'applied',
    spec: { text, isNewCapability, changedRequirements: [...spec.changes.values()], skipped: spec.skipped },
  };
}
