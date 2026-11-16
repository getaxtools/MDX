import type { DeltaSpec, NamedLine } from './parseDeltaSpec';
import { hasShallOrMust, requirementTextOf, scenariosOf, type RequirementBlock } from './requirementBlocks';
import { scenarioStepFindings } from './scenarioStepFindings';
import { findingOf, MAX_REQUIREMENT_TEXT_LENGTH, type StructuralFinding } from './structuralFindings';

const REQUIREMENTS_SECTION_TITLE = /\brequirements?$/i;

function foldedName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ');
}

/** The entries after the first of each name, which the spec tool reports as duplicates. */
function repeatedEntries<Entry extends NamedLine>(entries: readonly Entry[]): Entry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const isRepeat = seen.has(entry.name);
    seen.add(entry.name);
    return isRepeat;
  });
}

function requirementTextFindings(
  path: string,
  block: RequirementBlock,
  isAdded: boolean,
): StructuralFinding[] {
  const place = { path, line: block.line, subject: block.name };
  const text = requirementTextOf(block);
  if (text === '') return [findingOf('requirementWithoutText', place)];
  const findings: StructuralFinding[] = [];
  if (!hasShallOrMust(text)) findings.push(findingOf('requirementWithoutShallOrMust', place));
  if (isAdded && text.length > MAX_REQUIREMENT_TEXT_LENGTH)
    findings.push(findingOf('addedRequirementTooLong', place));
  return findings;
}

function addedOrModifiedFindings(
  path: string,
  block: RequirementBlock,
  isAdded: boolean,
): StructuralFinding[] {
  const scenarios = scenariosOf(block);
  const withoutScenario = scenarios.some((scenario) => scenario.hasBody)
    ? []
    : [
        findingOf('requirementWithoutScenario', {
          path,
          line: block.line,
          subject: block.name,
          detail: scenarios.length > 0 ? 'emptyScenario' : undefined,
        }),
      ];
  return [
    ...requirementTextFindings(path, block, isAdded),
    ...withoutScenario,
    ...scenarioStepFindings(path, block),
  ];
}

function duplicateFindings(path: string, delta: DeltaSpec): StructuralFinding[] {
  const duplicateIn = (section: string, entries: readonly NamedLine[]) =>
    repeatedEntries(entries).map((entry) =>
      findingOf('duplicateRequirement', { path, line: entry.line, subject: entry.name, detail: section }),
    );
  const duplicateRenames = (side: 'from' | 'to') =>
    repeatedEntries(delta.renamed.map((rename) => rename[side])).map((entry) =>
      findingOf('duplicateRename', { path, line: entry.line, subject: entry.name, detail: side }),
    );
  return [
    ...duplicateIn('added', delta.added),
    ...duplicateIn('modified', delta.modified),
    ...duplicateIn('removed', delta.removed),
    ...duplicateRenames('from'),
    ...duplicateRenames('to'),
  ];
}

function twoSectionFindings(path: string, delta: DeltaSpec): StructuralFinding[] {
  const removedNames = new Set(delta.removed.map((entry) => entry.name));
  const addedNames = new Set(delta.added.map((entry) => entry.name));
  const inBoth = (entries: readonly NamedLine[], others: ReadonlySet<string>, sections: string) =>
    entries
      .filter(
        (entry, index) =>
          others.has(entry.name) && entries.findIndex((other) => other.name === entry.name) === index,
      )
      .map((entry) =>
        findingOf('requirementInTwoSections', {
          path,
          line: entry.line,
          subject: entry.name,
          detail: sections,
        }),
      );
  return [
    ...inBoth(delta.modified, removedNames, 'modified,removed'),
    ...inBoth(delta.modified, addedNames, 'modified,added'),
    ...inBoth(delta.added, removedNames, 'added,removed'),
  ];
}

function renameConflictFindings(path: string, delta: DeltaSpec): StructuralFinding[] {
  const modifiedNames = new Set(delta.modified.map((entry) => entry.name));
  const addedNames = new Set(delta.added.map((entry) => entry.name));
  return delta.renamed.flatMap(({ from, to }) => {
    const findings: StructuralFinding[] = [];
    if (modifiedNames.has(from.name)) {
      findings.push(findingOf('modifiedUsesRenamedName', { path, line: from.line, subject: to.name }));
    }
    if (addedNames.has(to.name))
      findings.push(findingOf('renameCollidesWithAdded', { path, line: to.line, subject: to.name }));
    const removed = delta.removed.find((entry) => foldedName(entry.name) === foldedName(from.name));
    if (removed) {
      findings.push(
        findingOf('requirementInTwoSections', {
          path,
          line: from.line,
          subject: from.name,
          detail: 'renamed,removed',
        }),
      );
    }
    return findings;
  });
}

function sectionFindings(path: string, delta: DeltaSpec): StructuralFinding[] {
  const entryCount = delta.added.length + delta.modified.length + delta.removed.length + delta.renamed.length;
  if (entryCount > 0) return [];
  if (delta.sections.length === 0) return [findingOf('deltaFileWithoutSections', { path })];
  const titles = [...new Set(delta.sections.map((section) => section.operation))].join(',');
  return [
    findingOf('deltaSectionsWithoutRequirements', { path, line: delta.sections[0]?.line, detail: titles }),
  ];
}

function misplacedRequirementFindings(path: string, delta: DeltaSpec): StructuralFinding[] {
  const unrenamed = delta.unpairedRenames.map((rename) =>
    findingOf('unpairedRename', { path, line: rename.line, subject: rename.name, detail: rename.side }),
  );
  const underUnknownSection = delta.orphanedRequirements
    .filter((orphan) => orphan.section !== undefined && REQUIREMENTS_SECTION_TITLE.test(orphan.section))
    .map((orphan) =>
      findingOf('requirementUnderUnknownSection', {
        path,
        line: orphan.line,
        subject: orphan.name,
        detail: orphan.section,
      }),
    );
  return [...unrenamed, ...underUnknownSection];
}

/** The structural findings of one spec delta file of a change, by the spec tool's rules. */
export function checkDeltaSpec(path: string, delta: DeltaSpec): StructuralFinding[] {
  return [
    ...sectionFindings(path, delta),
    ...misplacedRequirementFindings(path, delta),
    ...delta.added.flatMap((block) => addedOrModifiedFindings(path, block, true)),
    ...delta.modified.flatMap((block) => addedOrModifiedFindings(path, block, false)),
    ...duplicateFindings(path, delta),
    ...twoSectionFindings(path, delta),
    ...renameConflictFindings(path, delta),
  ];
}
