import { fencedLineMask, withoutClosingHashes } from './specLines';

/** A `### Requirement:` header and every line up to the next requirement or `## ` header. */
export interface RequirementBlock {
  readonly name: string;
  /** The header's line in the document, counted from 1. */
  readonly line: number;
  /** The header line first, then the body; trailing blank lines dropped. */
  readonly lines: readonly string[];
}

/** A `#### ` child of a requirement; any level-4 heading counts, labelled `Scenario:` or not. */
export interface ScenarioBlock {
  readonly name: string;
  readonly line: number;
  readonly isLabelledScenario: boolean;
  /** Whether text follows the header before the next heading of level 4 or above. */
  readonly hasBody: boolean;
  /** Whether text follows the header before the next level-4 heading, where its steps are read. */
  readonly hasStepLines: boolean;
  readonly hasTriggerStep: boolean;
  readonly hasOutcomeStep: boolean;
}

interface MaskedLines {
  readonly lines: readonly string[];
  readonly fenced: readonly boolean[];
}

export interface LineRange {
  /** The first line, counted from 0. */
  readonly start: number;
  /** The line after the last one. */
  readonly end: number;
}

const REQUIREMENT_HEADER = /^###\s*Requirement:\s*(.+)\s*$/i;
const TOP_LEVEL_HEADER = /^##\s+/;
const ANY_HEADER = /^#{1,6}\s/;
const SCENARIO_HEADER = /^####\s+/;
const SCENARIO_BODY_END = /^#{1,4}\s/;
const SCENARIO_LABEL = /^Scenario:\s*/i;
const METADATA_LINE = /^\*\*[^*]+\*\*:/;
const SHALL_OR_MUST = /\b(?:SHALL|MUST)\b/;
const BOLD_TRIGGER = /(?:\*\*|__)(?:WHEN|GIVEN):?(?:\*\*|__)/i;
const BARE_TRIGGER = /\b(?:WHEN|GIVEN)\b/;
const BOLD_OUTCOME = /(?:\*\*|__)THEN:?(?:\*\*|__)/i;
const BARE_OUTCOME = /\bTHEN\b/;

/** The requirement name a header line declares, or undefined when it is not a requirement header. */
export function requirementNameIn(line: string): string | undefined {
  const name = REQUIREMENT_HEADER.exec(line)?.[1];
  return name === undefined ? undefined : withoutClosingHashes(name);
}

function withoutTrailingBlankLines(lines: readonly string[]): string[] {
  const kept = [...lines];
  while (kept.length > 1 && (kept.at(-1) ?? '').trim() === '') kept.pop();
  return kept;
}

/** The requirement blocks between two lines of a document whose fenced lines are masked. */
export function requirementBlocksIn(
  lines: readonly string[],
  fenced: readonly boolean[],
  range: LineRange,
): RequirementBlock[] {
  const isHeaderAt = (index: number) => !fenced[index] && requirementNameIn(lines[index] ?? '') !== undefined;
  const isSectionAt = (index: number) => !fenced[index] && TOP_LEVEL_HEADER.test(lines[index] ?? '');
  const blocks: RequirementBlock[] = [];
  for (let index = range.start; index < range.end; index += 1) {
    if (!isHeaderAt(index)) continue;
    let end = index + 1;
    while (end < range.end && !isHeaderAt(end) && !isSectionAt(end)) end += 1;
    const name = requirementNameIn(lines[index] ?? '') ?? '';
    blocks.push({ name, line: index + 1, lines: withoutTrailingBlankLines(lines.slice(index, end)) });
    index = end - 1;
  }
  return blocks;
}

/** The requirement text before its first heading, without fenced lines; metadata lines count only alone. */
export function requirementTextOf(block: RequirementBlock): string {
  const body = block.lines.slice(1);
  const fenced = fencedLineMask(body);
  const textLines: string[] = [];
  const metadataLines: string[] = [];
  for (const [index, line] of body.entries()) {
    if (fenced[index]) continue;
    if (ANY_HEADER.test(line)) break;
    const trimmed = line.trim();
    if (trimmed === '') continue;
    (METADATA_LINE.test(trimmed) ? metadataLines : textLines).push(trimmed);
  }
  return (textLines.length > 0 ? textLines : metadataLines).join('\n');
}

export function hasShallOrMust(text: string): boolean {
  return SHALL_OR_MUST.test(text);
}

/** The scenario name as its heading shows it, without a closing `#` run or a `Scenario:` label. */
export function scenarioNameOf(headerText: string): string {
  return headerText
    .replace(/[ \t]+#+[ \t]*$/, '')
    .replace(SCENARIO_LABEL, '')
    .trim();
}

function stepsOf(stepLines: readonly string[]): Pick<ScenarioBlock, 'hasTriggerStep' | 'hasOutcomeStep'> {
  const fenced = fencedLineMask(stepLines);
  const unfenced = stepLines.filter((_, index) => !fenced[index]);
  return {
    hasTriggerStep: unfenced.some((line) => BOLD_TRIGGER.test(line) || BARE_TRIGGER.test(line)),
    hasOutcomeStep: unfenced.some((line) => BOLD_OUTCOME.test(line) || BARE_OUTCOME.test(line)),
  };
}

/** The lines after a scenario header up to the next unfenced line that matches `ending`. */
function linesAfterHeader(masked: MaskedLines, header: number, ending: RegExp): readonly string[] {
  const { lines, fenced } = masked;
  let end = header + 1;
  while (end < lines.length && (fenced[end] || !ending.test(lines[end] ?? ''))) end += 1;
  return lines.slice(header + 1, end);
}

function hasText(lines: readonly string[]): boolean {
  return lines.some((line) => line.trim() !== '');
}

/** The scenarios of a requirement block, in order. */
export function scenariosOf(block: RequirementBlock): ScenarioBlock[] {
  const masked: MaskedLines = { lines: block.lines, fenced: fencedLineMask(block.lines) };
  return block.lines.flatMap((line, index) => {
    if (masked.fenced[index] || !SCENARIO_HEADER.test(line)) return [];
    const stepLines = linesAfterHeader(masked, index, SCENARIO_HEADER);
    const headerText = line.replace(SCENARIO_HEADER, '');
    return [
      {
        name: scenarioNameOf(headerText),
        line: block.line + index,
        isLabelledScenario: SCENARIO_LABEL.test(headerText),
        hasBody: hasText(linesAfterHeader(masked, index, SCENARIO_BODY_END)),
        hasStepLines: hasText(stepLines),
        ...stepsOf(stepLines),
      },
    ];
  });
}
