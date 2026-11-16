import type { DeltaSpec, NamedLine } from './parseDeltaSpec';

/** Why a delta cannot be applied to its capability's spec, in the spec tool's terms. */
export type DeltaRefusalReason =
  | 'unpairedRename'
  | 'requirementUnderUnknownSection'
  | 'duplicateInSection'
  | 'inTwoSections'
  | 'modifiedUsesRenamedName'
  | 'renameCollidesWithAdded'
  | 'noOperations'
  | 'changeOnNewCapability'
  | 'currentSpecInvalid'
  | 'renameSourceNotFound'
  | 'renameSourceMisspelled'
  | 'renameTargetExists'
  | 'renameTargetNearMatch'
  | 'removedMisspelled'
  | 'modifiedNotFound'
  | 'modifiedDropsScenario'
  | 'addedExists'
  | 'addedNearMatch';

export interface DeltaRefusal {
  readonly reason: DeltaRefusalReason;
  /** The requirement the refusal names. */
  readonly requirement?: string | undefined;
  /** A second name: the existing spelling, the other section or the dropped scenarios. */
  readonly detail?: string | undefined;
  readonly line?: number | undefined;
}

const REQUIREMENTS_SECTION_TITLE = /\brequirements?$/i;

/** Two spellings of one requirement that differ only in case or spacing. */
export function foldedName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ');
}

function firstRepeat(entries: readonly NamedLine[]): NamedLine | undefined {
  const seen = new Set<string>();
  return entries.find((entry) => {
    const isRepeat = seen.has(entry.name);
    seen.add(entry.name);
    return isRepeat;
  });
}

function malformedDeltaRefusal(delta: DeltaSpec): DeltaRefusal | undefined {
  const unpaired = delta.unpairedRenames[0];
  if (unpaired)
    return {
      reason: 'unpairedRename',
      requirement: unpaired.name,
      detail: unpaired.side,
      line: unpaired.line,
    };
  const misplaced = delta.orphanedRequirements.find(
    (orphan) => orphan.section !== undefined && REQUIREMENTS_SECTION_TITLE.test(orphan.section),
  );
  if (misplaced) {
    return {
      reason: 'requirementUnderUnknownSection',
      requirement: misplaced.name,
      detail: misplaced.section,
      line: misplaced.line,
    };
  }
  return undefined;
}

function duplicateRefusal(delta: DeltaSpec): DeltaRefusal | undefined {
  const sections: readonly (readonly [string, readonly NamedLine[]])[] = [
    ['added', delta.added],
    ['modified', delta.modified],
    ['removed', delta.removed],
  ];
  for (const [section, entries] of sections) {
    const repeat = firstRepeat(entries);
    if (repeat)
      return { reason: 'duplicateInSection', requirement: repeat.name, detail: section, line: repeat.line };
  }
  const renameRepeat =
    firstRepeat(delta.renamed.map((rename) => rename.from)) ??
    firstRepeat(delta.renamed.map((rename) => rename.to));
  return renameRepeat
    ? {
        reason: 'duplicateInSection',
        requirement: renameRepeat.name,
        detail: 'renamed',
        line: renameRepeat.line,
      }
    : undefined;
}

function renameConflictRefusal(delta: DeltaSpec): DeltaRefusal | undefined {
  const modifiedNames = new Set(delta.modified.map((entry) => entry.name));
  const addedNames = new Set(delta.added.map((entry) => entry.name));
  for (const { from, to } of delta.renamed) {
    if (delta.removed.some((entry) => foldedName(entry.name) === foldedName(from.name))) {
      return { reason: 'inTwoSections', requirement: from.name, detail: 'renamed,removed', line: from.line };
    }
    if (modifiedNames.has(from.name))
      return { reason: 'modifiedUsesRenamedName', requirement: to.name, line: from.line };
    if (addedNames.has(to.name))
      return { reason: 'renameCollidesWithAdded', requirement: to.name, line: to.line };
  }
  return undefined;
}

function sectionConflictRefusal(delta: DeltaSpec): DeltaRefusal | undefined {
  const removedNames = new Set(delta.removed.map((entry) => entry.name));
  const addedNames = new Set(delta.added.map((entry) => entry.name));
  for (const entry of delta.modified) {
    if (removedNames.has(entry.name))
      return { reason: 'inTwoSections', requirement: entry.name, detail: 'modified,removed' };
    if (addedNames.has(entry.name))
      return { reason: 'inTwoSections', requirement: entry.name, detail: 'modified,added' };
  }
  const addedAndRemoved = delta.added.find((entry) => removedNames.has(entry.name));
  return addedAndRemoved
    ? { reason: 'inTwoSections', requirement: addedAndRemoved.name, detail: 'added,removed' }
    : undefined;
}

/** The first reason, in the spec tool's order, that a delta is refused before it is applied to any spec. */
export function refusalBeforeApplying(delta: DeltaSpec): DeltaRefusal | undefined {
  const entryCount = delta.added.length + delta.modified.length + delta.removed.length + delta.renamed.length;
  return (
    malformedDeltaRefusal(delta) ??
    duplicateRefusal(delta) ??
    renameConflictRefusal(delta) ??
    sectionConflictRefusal(delta) ??
    (entryCount === 0 ? { reason: 'noOperations' } : undefined)
  );
}
