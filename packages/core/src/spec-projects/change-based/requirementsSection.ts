import { requirementBlocksIn, requirementNameIn, type RequirementBlock } from './requirementBlocks';
import { fencedLineMask, specLinesOf } from './specLines';

/** A capability spec cut around its `## Requirements` section, as archiving rebuilds it. */
export interface RequirementsSection {
  readonly before: string;
  readonly headerLine: string;
  /** Text between the heading and the first requirement. */
  readonly preamble: string;
  readonly blocks: readonly RequirementBlock[];
  readonly after: string;
}

const REQUIREMENTS_HEADER = /^##\s+Requirements(?:[ \t]+#+)?\s*$/i;
const TOP_LEVEL_HEADER = /^##\s+/;
const PURPOSE_HEADER = /^##\s+Purpose(?:[ \t]+#+)?\s*$/i;
const DELTA_HEADER = /^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements(?:[ \t]+#+)?\s*$/i;
const DEFAULT_REQUIREMENTS_HEADER = '## Requirements';

function endOfSection(lines: readonly string[], fenced: readonly boolean[], header: number): number {
  let end = header + 1;
  while (end < lines.length && (fenced[end] || !TOP_LEVEL_HEADER.test(lines[end] ?? ''))) end += 1;
  return end;
}

export function requirementsSectionOf(text: string): RequirementsSection {
  const lines = specLinesOf(text);
  const fenced = fencedLineMask(lines);
  const header = lines.findIndex((line, index) => !fenced[index] && REQUIREMENTS_HEADER.test(line));
  if (header === -1) {
    const whole = lines.join('\n').trimEnd();
    const before = whole === '' ? '' : `${whole}\n\n`;
    return { before, headerLine: DEFAULT_REQUIREMENTS_HEADER, preamble: '', blocks: [], after: '\n' };
  }
  const end = endOfSection(lines, fenced, header);
  const blocks = requirementBlocksIn(lines, fenced, { start: header + 1, end });
  const preambleEnd = blocks[0] === undefined ? end : blocks[0].line - 1;
  const before = lines.slice(0, header).join('\n');
  const after = lines.slice(end).join('\n');
  return {
    before: before.trimEnd() === '' ? before : `${before}\n`,
    headerLine: lines[header] ?? DEFAULT_REQUIREMENTS_HEADER,
    preamble: lines
      .slice(header + 1, preambleEnd)
      .join('\n')
      .trimEnd(),
    blocks,
    after: after.startsWith('\n') ? after : `\n${after}`,
  };
}

/** Joins a block back into text, as archiving writes it. */
export function blockText(block: RequirementBlock): string {
  return block.lines.join('\n').trimEnd();
}

function withoutBlankRunsOutsideFences(text: string): string {
  const lines = text.split('\n');
  const fenced = fencedLineMask(lines);
  return lines
    .filter(
      (line, index) =>
        fenced[index] === true || line !== '' || lines[index - 1] !== '' || fenced[index - 1] === true,
    )
    .join('\n');
}

/** The spec text with a new list of requirement blocks, each slice separated by one blank line. */
export function rebuiltSpec(section: RequirementsSection, blocks: readonly RequirementBlock[]): string {
  const preamble = section.preamble.trim() === '' ? [] : [section.preamble.trimEnd()];
  const body = [...preamble, ...blocks.map(blockText)].join('\n\n').trimEnd();
  const slices = [section.before.trimEnd(), section.headerLine, body, section.after.trim()].filter(
    (slice) => slice !== '',
  );
  return `${withoutBlankRunsOutsideFences(slices.join('\n\n')).trimEnd()}\n`;
}

/** Blanks out HTML comments, keeping line breaks; a comment never closed runs to the end. */
function withoutHtmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?(?:--!?>|$)/g, (comment) => comment.replace(/[^\n]/g, ' '));
}

/** The body of a delta's `## Purpose`, or undefined when it holds no text outside fences and comments. */
export function deltaPurposeOf(text: string): string | undefined {
  const lines = specLinesOf(text);
  const visible = withoutHtmlComments(lines.join('\n')).split('\n');
  const fenced = fencedLineMask(visible);
  const start = visible.findIndex((line, index) => !fenced[index] && PURPOSE_HEADER.test(line));
  if (start === -1) return undefined;
  const end = endOfSection(visible, fenced, start);
  const prose = visible
    .slice(start + 1, end)
    .filter((_, offset) => !fenced[start + 1 + offset])
    .join('\n')
    .trim();
  if (prose === '') return undefined;
  const body = lines
    .slice(start + 1, end)
    .join('\n')
    .trim();
  return body === '' ? undefined : body;
}

/** The first line that keeps a capability spec from being updated, or undefined when it can be. */
export function specStructureProblemLine(text: string): number | undefined {
  const raw = specLinesOf(text);
  const fenced = fencedLineMask(raw);
  const lines = raw.map((line, index) => (fenced[index] ? '' : line));
  const header = lines.findIndex((line) => REQUIREMENTS_HEADER.test(line));
  const end = header === -1 ? lines.length : endOfSection(lines, [], header);
  const seenNames = new Set<string>();
  for (const [index, line] of lines.entries()) {
    if (line.trim() === '') continue;
    if (DELTA_HEADER.test(line)) return index + 1;
    const name = requirementNameIn(line);
    if (name === undefined) continue;
    const isInsideRequirements = header !== -1 && index > header && index < end;
    if (!isInsideRequirements || seenNames.has(name)) return index + 1;
    seenNames.add(name);
  }
  return undefined;
}
