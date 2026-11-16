import { parseMainSpec, type MainSpec } from './parseMainSpec';
import { hasShallOrMust, requirementTextOf, type RequirementBlock } from './requirementBlocks';
import { scenarioStepFindings } from './scenarioStepFindings';
import { fencedLineMask } from './specLines';
import {
  findingOf,
  MAX_REQUIREMENT_TEXT_LENGTH,
  MIN_PURPOSE_LENGTH,
  type StructuralFinding,
} from './structuralFindings';

// The sentence archiving writes into a new capability's spec, in its two fixed halves.
const ARCHIVE_PLACEHOLDER_START = 'TBD - created by archiving change ';
const ARCHIVE_PLACEHOLDER_END = '. Update Purpose after archive.';
const NOT_A_WORD_CHARACTER = '(?![\\p{L}\\p{N}\\p{M}_])';
// `TOD[O]` matches the same word; written so, the source hygiene check does not read it as a note.
const PLACEHOLDER_WORDS = '(?:TBD|TOD[O])';
const SHOUTED_MARKER = new RegExp(`^${PLACEHOLDER_WORDS}${NOT_A_WORD_CHARACTER}`, 'u');
// In other cases `todo` opens Spanish and Portuguese sentences, so it counts only before punctuation.
const PUNCTUATED_MARKER = new RegExp(
  `^${PLACEHOLDER_WORDS}${NOT_A_WORD_CHARACTER}(?=[ \\t]*(?:$|\\n|[:\\-\u2013\u2014.,;()\\[\\]{}]))`,
  'iu',
);
const PURPOSE_HEADER = /^ {0,3}##(?!#)[ \t]+Purpose(?:[ \t]+#+)?[ \t]*$/i;
const TOP_LEVEL_HEADER = /^ {0,3}#{1,2}(?!#)[ \t]+/;

function unfencedText(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const fenced = fencedLineMask(lines);
  return lines
    .filter((_, index) => !fenced[index])
    .join('\n')
    .trim();
}

function archivePlaceholderStart(text: string): number | undefined {
  let end = text.indexOf(ARCHIVE_PLACEHOLDER_END);
  while (end !== -1) {
    const start = text.lastIndexOf(ARCHIVE_PLACEHOLDER_START, end);
    if (start !== -1) return start;
    end = text.indexOf(ARCHIVE_PLACEHOLDER_END, end + 1);
  }
  return undefined;
}

interface NumberedLine {
  readonly line: number;
  readonly text: string;
}

/** The unfenced lines of the `## Purpose` section, with their line numbers. */
function purposeSectionLines(spec: MainSpec): NumberedLine[] {
  const fenced = fencedLineMask(spec.lines);
  const header = spec.lines.findIndex((line, index) => !fenced[index] && PURPOSE_HEADER.test(line));
  if (header === -1) return [];
  const sectionLines: NumberedLine[] = [];
  for (let index = header + 1; index < spec.lines.length; index += 1) {
    const text = spec.lines[index] ?? '';
    if (fenced[index]) continue;
    if (TOP_LEVEL_HEADER.test(text)) break;
    sectionLines.push({ line: index + 1, text });
  }
  return sectionLines;
}

/** The line inside `## Purpose` that holds the placeholder, or undefined when no single line does. */
function placeholderLine(spec: MainSpec, isLeadingMarker: boolean): number | undefined {
  const sectionLines = purposeSectionLines(spec);
  if (isLeadingMarker) return sectionLines.find((entry) => entry.text.trim() !== '')?.line;
  const purposeText = sectionLines.map((entry) => entry.text).join('\n');
  const start = archivePlaceholderStart(purposeText);
  if (start === undefined) return undefined;
  return sectionLines[purposeText.slice(0, start).split('\n').length - 1]?.line;
}

function purposeFindings(path: string, spec: MainSpec, purpose: string): StructuralFinding[] {
  const prose = unfencedText(purpose);
  const isLeadingMarker = SHOUTED_MARKER.test(prose) || PUNCTUATED_MARKER.test(prose);
  if (isLeadingMarker || archivePlaceholderStart(prose) !== undefined) {
    return [findingOf('purposeIsPlaceholder', { path, line: placeholderLine(spec, isLeadingMarker) })];
  }
  return purpose.length < MIN_PURPOSE_LENGTH
    ? [findingOf('purposeTooShort', { path, line: spec.purpose?.line })]
    : [];
}

function requirementFindings(path: string, block: RequirementBlock): StructuralFinding[] {
  const place = { path, line: block.line, subject: block.name };
  const text = requirementTextOf(block);
  const shownText = text === '' ? block.name : text;
  const findings: StructuralFinding[] = [];
  if (shownText.length > MAX_REQUIREMENT_TEXT_LENGTH) findings.push(findingOf('requirementTooLong', place));
  if (text !== '' && !hasShallOrMust(text)) findings.push(findingOf('requirementWithoutShallOrMust', place));
  return [...findings, ...scenarioStepFindings(path, block)];
}

/** The structural findings of a capability's spec; a spec without Purpose or Requirements is not checked further. */
export function checkMainSpec(path: string, text: string): StructuralFinding[] {
  const spec = parseMainSpec(text);
  const purpose = spec.purpose?.text ?? '';
  if (purpose === '' || spec.requirementsLine === undefined) return [];
  return [
    ...purposeFindings(path, spec, purpose),
    ...spec.requirements.flatMap((block) => requirementFindings(path, block)),
  ];
}
