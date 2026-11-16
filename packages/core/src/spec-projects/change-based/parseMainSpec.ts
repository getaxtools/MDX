import { requirementBlocksIn, type RequirementBlock } from './requirementBlocks';
import { fencedLineMask, specLinesOf, withoutClosingHashes } from './specLines';

export interface SpecPurpose {
  /** The section text, trimmed. */
  readonly text: string;
  /** The `Purpose` heading's line, counted from 1. */
  readonly line: number;
}

/** A capability's spec, as the spec tool reads it. */
export interface MainSpec {
  readonly lines: readonly string[];
  readonly purpose?: SpecPurpose | undefined;
  /** The `## Requirements` heading's line, counted from 1. */
  readonly requirementsLine?: number;
  readonly requirements: readonly RequirementBlock[];
}

const HEADING = /^(#{1,6})\s+(.+)$/;
const REQUIREMENTS_HEADER = /^##\s+Requirements(?:[ \t]+#+)?\s*$/i;
const TOP_LEVEL_HEADER = /^##\s+/;
const PURPOSE_TITLE = 'purpose';

function headingLevelAt(
  lines: readonly string[],
  fenced: readonly boolean[],
  index: number,
): number | undefined {
  if (fenced[index]) return undefined;
  return HEADING.exec(lines[index] ?? '')?.[1]?.length;
}

/** The first heading titled Purpose at any level, with its text up to the next heading as high. */
function purposeOf(lines: readonly string[], fenced: readonly boolean[]): SpecPurpose | undefined {
  const start = lines.findIndex((line, index) => {
    const title = fenced[index] ? undefined : HEADING.exec(line)?.[2];
    return title !== undefined && withoutClosingHashes(title).toLowerCase() === PURPOSE_TITLE;
  });
  const level = headingLevelAt(lines, fenced, start);
  if (level === undefined) return undefined;
  let end = start + 1;
  while (end < lines.length && (headingLevelAt(lines, fenced, end) ?? Infinity) > level) end += 1;
  return {
    text: lines
      .slice(start + 1, end)
      .join('\n')
      .trim(),
    line: start + 1,
  };
}

export function parseMainSpec(text: string): MainSpec {
  const lines = specLinesOf(text);
  const fenced = fencedLineMask(lines);
  const purpose = purposeOf(lines, fenced);
  const header = lines.findIndex((line, index) => !fenced[index] && REQUIREMENTS_HEADER.test(line));
  if (header === -1) return { lines, purpose, requirements: [] };
  let end = header + 1;
  while (end < lines.length && (fenced[end] || !TOP_LEVEL_HEADER.test(lines[end] ?? ''))) end += 1;
  const requirements = requirementBlocksIn(lines, fenced, { start: header + 1, end });
  return { lines, purpose, requirementsLine: header + 1, requirements };
}
