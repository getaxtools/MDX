import { requirementBlocksIn, requirementNameIn, type RequirementBlock } from './requirementBlocks';
import { fencedLineMask, specLinesOf, withoutClosingHashes } from './specLines';

export type DeltaOperation = 'added' | 'modified' | 'removed' | 'renamed';

export interface DeltaSection {
  readonly operation: DeltaOperation;
  /** The heading as written, without its closing `#` run. */
  readonly title: string;
  /** The heading's line, counted from 1. */
  readonly line: number;
  /** Its body lines, counted from 0 in the document. */
  readonly start: number;
  readonly end: number;
}

export interface NamedLine {
  readonly name: string;
  readonly line: number;
}

export interface RequirementRename {
  readonly from: NamedLine;
  readonly to: NamedLine;
}

export interface UnpairedRename extends NamedLine {
  readonly side: 'from' | 'to';
}

export interface OrphanedRequirement extends NamedLine {
  /** The `## ` section it sits under, or undefined above the first one. */
  readonly section?: string | undefined;
}

/** A spec delta: what a change adds, modifies, removes and renames in one capability. */
export interface DeltaSpec {
  readonly lines: readonly string[];
  readonly sections: readonly DeltaSection[];
  readonly added: readonly RequirementBlock[];
  readonly modified: readonly RequirementBlock[];
  readonly removed: readonly NamedLine[];
  readonly renamed: readonly RequirementRename[];
  readonly unpairedRenames: readonly UnpairedRename[];
  /** Requirement headers outside the four delta sections, which the spec tool ignores. */
  readonly orphanedRequirements: readonly OrphanedRequirement[];
}

interface DocumentSection {
  readonly title: string;
  readonly line: number;
  readonly start: number;
  readonly end: number;
}

const SECTION_HEADER = /^##\s+(.+)$/;
const OPERATION_BY_TITLE: Readonly<Record<string, DeltaOperation>> = {
  'added requirements': 'added',
  'modified requirements': 'modified',
  'removed requirements': 'removed',
  'renamed requirements': 'renamed',
};
const REMOVED_BULLET = /^\s*[-*+]\s*`?###\s*Requirement:\s*(.+?)`?\s*$/;
const RENAME_FROM = /^\s*[-*+]?\s*FROM:\s*`?###\s*Requirement:\s*(.+?)`?\s*$/;
const RENAME_TO = /^\s*[-*+]?\s*TO:\s*`?###\s*Requirement:\s*(.+?)`?\s*$/;
const HTML_COMMENT = /<!--[\s\S]*?(?:--!?>|$)/g;

export function deltaOperationOf(sectionTitle: string): DeltaOperation | undefined {
  return OPERATION_BY_TITLE[sectionTitle.toLowerCase()];
}

function sectionsOf(lines: readonly string[], fenced: readonly boolean[]): DocumentSection[] {
  const headers = lines.flatMap((line, index) => {
    const title = fenced[index] ? undefined : SECTION_HEADER.exec(line)?.[1];
    return title === undefined ? [] : [{ title: withoutClosingHashes(title), index }];
  });
  return headers.map((header, position) => ({
    title: header.title,
    line: header.index + 1,
    start: header.index + 1,
    end: headers[position + 1]?.index ?? lines.length,
  }));
}

function removedNamesIn(
  lines: readonly string[],
  fenced: readonly boolean[],
  section: DeltaSection,
): NamedLine[] {
  const names: NamedLine[] = [];
  for (let index = section.start; index < section.end; index += 1) {
    if (fenced[index]) continue;
    const line = lines[index] ?? '';
    const name = requirementNameIn(line) ?? REMOVED_BULLET.exec(line)?.[1];
    if (name !== undefined) names.push({ name: withoutClosingHashes(name), line: index + 1 });
  }
  return names;
}

interface RenamesInSection {
  readonly pairs: RequirementRename[];
  readonly unpaired: UnpairedRename[];
}

/** FROM then TO pairs; a FROM displaced by another FROM, a TO without a FROM or a FROM left over is unpaired. */
function renamesIn(
  lines: readonly string[],
  fenced: readonly boolean[],
  section: DeltaSection,
): RenamesInSection {
  const entries: UnpairedRename[] = [];
  for (let index = section.start; index < section.end; index += 1) {
    const entry = fenced[index] ? undefined : renameEntryIn(lines[index] ?? '', index + 1);
    if (entry) entries.push(entry);
  }
  return pairedRenames(entries);
}

function pairedRenames(entries: readonly UnpairedRename[]): RenamesInSection {
  const found: RenamesInSection = { pairs: [], unpaired: [] };
  let pending: UnpairedRename | undefined;
  for (const entry of entries) {
    if (entry.side === 'from') {
      if (pending) found.unpaired.push(pending);
      pending = entry;
      continue;
    }
    if (pending) found.pairs.push({ from: namedLineOf(pending), to: namedLineOf(entry) });
    else found.unpaired.push(entry);
    pending = undefined;
  }
  if (pending) found.unpaired.push(pending);
  return found;
}

function namedLineOf(entry: NamedLine): NamedLine {
  return { name: entry.name, line: entry.line };
}

function renameEntryIn(line: string, lineNumber: number): UnpairedRename | undefined {
  const from = RENAME_FROM.exec(line)?.[1];
  if (from !== undefined) return { name: withoutClosingHashes(from), line: lineNumber, side: 'from' };
  const to = RENAME_TO.exec(line)?.[1];
  return to === undefined ? undefined : { name: withoutClosingHashes(to), line: lineNumber, side: 'to' };
}

/** The lines with HTML comments blanked out, keeping fenced lines and the line count as they are. */
function withoutHtmlComments(lines: readonly string[], fenced: readonly boolean[]): string[] {
  const blanked = lines
    .map((line, index) => (fenced[index] ? '' : line))
    .join('\n')
    .replace(HTML_COMMENT, (comment) => comment.replace(/[^\n]/g, ' '))
    .split('\n');
  return lines.map((line, index) => (fenced[index] ? line : (blanked[index] ?? '')));
}

function orphanedRequirementsIn(lines: readonly string[], fenced: readonly boolean[]): OrphanedRequirement[] {
  const visible = withoutHtmlComments(lines, fenced);
  const orphans: OrphanedRequirement[] = [];
  let section: string | undefined;
  for (const [index, line] of lines.entries()) {
    if (fenced[index]) continue;
    const title = SECTION_HEADER.exec(line)?.[1];
    if (title !== undefined) {
      section = withoutClosingHashes(title);
      continue;
    }
    if (section !== undefined && deltaOperationOf(section) !== undefined) continue;
    const name = requirementNameIn(visible[index] ?? '');
    if (name !== undefined) orphans.push({ name, line: index + 1, section });
  }
  return orphans;
}

function deltaSectionsOf(lines: readonly string[], fenced: readonly boolean[]): DeltaSection[] {
  return sectionsOf(lines, fenced).flatMap((section) => {
    const operation = deltaOperationOf(section.title);
    return operation === undefined ? [] : [{ ...section, operation }];
  });
}

/** Reads a spec delta with the spec tool's rules; a repeated or differently cased section heading adds to the first. */
export function parseDeltaSpec(text: string): DeltaSpec {
  const lines = specLinesOf(text);
  const fenced = fencedLineMask(lines);
  const sections = deltaSectionsOf(lines, fenced);
  const sectionsFor = (operation: DeltaOperation) =>
    sections.filter((section) => section.operation === operation);
  const blocksFor = (operation: DeltaOperation) =>
    sectionsFor(operation).flatMap((section) => requirementBlocksIn(lines, fenced, section));
  const renames = sectionsFor('renamed').map((section) => renamesIn(lines, fenced, section));
  return {
    lines,
    sections,
    added: blocksFor('added'),
    modified: blocksFor('modified'),
    removed: sectionsFor('removed').flatMap((section) => removedNamesIn(lines, fenced, section)),
    renamed: renames.flatMap((found) => found.pairs),
    unpairedRenames: renames
      .flatMap((found) => found.unpaired)
      .sort((first, second) => first.line - second.line),
    orphanedRequirements: orphanedRequirementsIn(lines, fenced),
  };
}
