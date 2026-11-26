import { CodePointSet, formatCodePoint } from './CodePointSet';
import type { SourceRange } from './DocumentStructure';
import { HiddenCharacterNames } from './HiddenCharacterNames';
import { hiddenCharactersOf } from './matchers/scanHiddenCharacters';
import { Ruleset } from './Ruleset';
import type { TextPositions } from './TextPositions';

export const MAX_EXCERPT_LENGTH = 120;

const CONTEXT_LENGTH = 40;
const ELLIPSIS = '…';
const MARKER_OPEN = '⟨';
const MARKER_CLOSE = '⟩';
const REPEAT_SIGN = '×';
const UNASSIGNED_OR_UNPAIRED = /^[\p{Cn}\p{Cs}]$/u;
const LOW_SURROGATE = /^[\uDC00-\uDFFF]$/;

interface ExcerptToken {
  readonly text: string;
  readonly markerLabel?: string;
  readonly repeatCount: number;
}

interface TakenTokens {
  readonly text: string;
  readonly isComplete: boolean;
}

export interface ExcerptSource {
  readonly text: string;
  readonly positions: TextPositions;
  readonly ruleset: Ruleset;
}

const markedCharactersByRuleset = new WeakMap<Ruleset, CodePointSet>();

function markedCharactersOf(ruleset: Ruleset): CodePointSet {
  let marked = markedCharactersByRuleset.get(ruleset);
  if (!marked) {
    marked = CodePointSet.union([
      hiddenCharactersOf(ruleset),
      HiddenCharacterNames.bundled().namedCodePoints(),
    ]);
    markedCharactersByRuleset.set(ruleset, marked);
  }
  return marked;
}

function markerLabelOf(character: string, marked: CodePointSet): string | undefined {
  const codePoint = character.codePointAt(0) ?? 0;
  if (!marked.has(codePoint) && !UNASSIGNED_OR_UNPAIRED.test(character)) return undefined;
  return HiddenCharacterNames.bundled().nameOf(codePoint)?.abbreviation ?? formatCodePoint(codePoint);
}

function withMarkerText(token: ExcerptToken): ExcerptToken {
  if (token.markerLabel === undefined) return token;
  const repeat = token.repeatCount > 1 ? `${REPEAT_SIGN}${String(token.repeatCount)}` : '';
  return { ...token, text: `${MARKER_OPEN}${token.markerLabel}${repeat}${MARKER_CLOSE}` };
}

/** Splits text into visible characters and markers, joining a run of the same hidden character into one marker. */
function tokenize(text: string, marked: CodePointSet): ExcerptToken[] {
  const tokens: ExcerptToken[] = [];
  for (const character of text) {
    const markerLabel = markerLabelOf(character, marked);
    const previous = tokens.at(-1);
    if (markerLabel === undefined)
      tokens.push({ text: character === '\t' ? ' ' : character, repeatCount: 1 });
    else if (previous?.markerLabel === markerLabel)
      tokens[tokens.length - 1] = { ...previous, repeatCount: previous.repeatCount + 1 };
    else tokens.push({ text: '', markerLabel, repeatCount: 1 });
  }
  return tokens.map(withMarkerText);
}

function lengthOf(text: string): number {
  return Array.from(text).length;
}

function takeWithin(tokens: readonly ExcerptToken[], budget: number): TakenTokens {
  let text = '';
  let used = 0;
  for (const token of tokens) {
    const length = lengthOf(token.text);
    if (used + length > budget) return { text, isComplete: false };
    text += token.text;
    used += length;
  }
  return { text, isComplete: true };
}

function takeEndWithin(tokens: readonly ExcerptToken[], budget: number): TakenTokens {
  let text = '';
  let used = 0;
  for (const token of [...tokens].reverse()) {
    const length = lengthOf(token.text);
    if (used + length > budget) return { text, isComplete: false };
    text = token.text + text;
    used += length;
  }
  return { text, isComplete: true };
}

function onCodePointBoundary(text: string, offset: number): number {
  return LOW_SURROGATE.test(text.charAt(offset)) ? offset + 1 : offset;
}

/**
 * The line around a finding as safe display text, at most 120 characters: hidden characters become
 * labelled markers, the finding itself gets the budget first, and context before and after share the rest.
 */
export function safeExcerpt(source: ExcerptSource, range: SourceRange): string {
  const { text, positions } = source;
  const marked = markedCharactersOf(source.ruleset);
  const line = positions.lineOf(range.from);
  const lineStart = positions.lineStart(line);
  const lineEnd = positions.lineEnd(line);
  const findingEnd = Math.max(range.from, Math.min(range.to, lineEnd));
  const contextStart = onCodePointBoundary(text, Math.max(lineStart, range.from - CONTEXT_LENGTH));
  const contextEnd = onCodePointBoundary(text, Math.min(lineEnd, findingEnd + CONTEXT_LENGTH));
  let budget = MAX_EXCERPT_LENGTH - 2 * ELLIPSIS.length;
  const finding = takeWithin(tokenize(text.slice(range.from, findingEnd), marked), budget);
  budget -= lengthOf(finding.text);
  const before = takeEndWithin(tokenize(text.slice(contextStart, range.from), marked), budget);
  budget -= lengthOf(before.text);
  const after = takeWithin(tokenize(text.slice(findingEnd, contextEnd), marked), budget);
  const isCutBefore = contextStart > lineStart || !before.isComplete;
  const isCutAfter =
    !finding.isComplete || findingEnd < range.to || contextEnd < lineEnd || !after.isComplete;
  return (
    (isCutBefore ? ELLIPSIS : '') + before.text + finding.text + after.text + (isCutAfter ? ELLIPSIS : '')
  );
}

/**
 * Any text for the panel, such as text decoded from a hidden payload, made as safe as an excerpt:
 * hidden and direction characters become markers, and it is cut to 120 characters.
 */
export function safeDisplayText(text: string, ruleset: Ruleset = Ruleset.bundled()): string {
  const shown = takeWithin(tokenize(text, markedCharactersOf(ruleset)), MAX_EXCERPT_LENGTH - ELLIPSIS.length);
  return shown.isComplete ? shown.text : shown.text + ELLIPSIS;
}
