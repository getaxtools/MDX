import { tags } from '@lezer/highlight';
import type { BlockContext, InlineContext, Line, MarkdownConfig } from './markdownParserTypes';
import { continuesQuoteLazily, enclosingQuoteCount, quoteMarkersOf } from './quoteRegion';
import { linesAfter, linesFrom, type DocumentLine } from './readingAhead';

const DOLLAR = '$';
const DOLLAR_CODE = DOLLAR.charCodeAt(0);
const DISPLAY_DELIMITER = '$$';
const WHITESPACE = /\s/;
const DIGIT = /\d/;
const CODE_BLOCK_INDENT = 4;

interface ClosingLine {
  /** Where the closing line starts. */
  readonly from: number;
  /** Where its closing `$$` ends. */
  readonly end: number;
}

/**
 * `$…$` and `$$…$$` with the preview's dollar rules, so Rich text and the preview agree on what is
 * math: `InlineMath` inside a line and `DisplayMath` on lines of its own, each delimiter a `MathMark`.
 */
export const MATH_SYNTAX: MarkdownConfig = {
  defineNodes: [
    { name: 'InlineMath' },
    { name: 'DisplayMath', block: true },
    { name: 'MathMark', style: tags.processingInstruction },
  ],
  parseInline: [{ name: 'InlineMath', parse: parseInlineMath, before: 'Escape' }],
  parseBlock: [
    {
      name: 'DisplayMath',
      parse: parseDisplayMath,
      endLeaf: (context, line) => displayMathClosing(context, line) !== undefined,
      before: 'FencedCode',
    },
  ],
};

function parseInlineMath(context: InlineContext, next: number, start: number): number {
  if (next !== DOLLAR_CODE) return -1;
  const source = context.slice(start, context.end);
  const delimiter = source.startsWith(DISPLAY_DELIMITER) ? DISPLAY_DELIMITER : DOLLAR;
  const contentEnd =
    delimiter === DISPLAY_DELIMITER
      ? findClosingDisplayDelimiter(source, delimiter.length)
      : findClosingInlineDelimiter(source, delimiter.length);
  if (contentEnd === -1) return -1;
  const end = start + contentEnd + delimiter.length;
  return context.addElement(
    context.elt('InlineMath', start, end, [
      context.elt('MathMark', start, start + delimiter.length),
      context.elt('MathMark', end - delimiter.length, end),
    ]),
  );
}

/** A single `$` closes only when it hugs the math, so prices such as "$5 and $10" stay text. */
function findClosingInlineDelimiter(source: string, contentStart: number): number {
  const firstCharacter = source[contentStart];
  if (firstCharacter === undefined || WHITESPACE.test(firstCharacter) || firstCharacter === DOLLAR) return -1;
  for (let index = contentStart + 1; index < source.length; index += 1) {
    if (isClosingDollar(source, index)) return index;
  }
  return -1;
}

function isClosingDollar(source: string, index: number): boolean {
  const previous = source[index - 1] ?? ' ';
  const isEscaped = previous === '\\';
  const isBeforeDigit = DIGIT.test(source[index + 1] ?? '');
  return source[index] === DOLLAR && !isEscaped && !WHITESPACE.test(previous) && !isBeforeDigit;
}

function findClosingDisplayDelimiter(source: string, contentStart: number): number {
  const end = source.indexOf(DISPLAY_DELIMITER, contentStart);
  return end > contentStart && source.slice(contentStart, end).trim() !== '' ? end : -1;
}

function parseDisplayMath(context: BlockContext, line: Line): boolean {
  const closing = displayMathClosing(context, line);
  if (!closing) return false;
  const from = context.lineStart + line.pos;
  const marks = [context.elt('MathMark', from, from + DISPLAY_DELIMITER.length)];
  while (context.lineStart < closing.from && context.nextLine()) marks.push(...line.markers);
  marks.push(context.elt('MathMark', closing.end - DISPLAY_DELIMITER.length, closing.end));
  const end = context.lineStart + line.text.length;
  context.nextLine();
  context.addElement(context.elt('DisplayMath', from, end, marks));
  return true;
}

/** A line starting with `$$` opens display math only when a line ending with `$$` closes it. */
function displayMathClosing(context: BlockContext, line: Line): ClosingLine | undefined {
  if (line.indent - line.baseIndent >= CODE_BLOCK_INDENT) return undefined;
  if (!line.text.startsWith(DISPLAY_DELIMITER, line.pos)) return undefined;
  const afterOpening = line.text.slice(line.pos + DISPLAY_DELIMITER.length);
  if (afterOpening.trimEnd().endsWith(DISPLAY_DELIMITER)) return closingIn(context.lineStart, line.text);
  return closingLineAfter(context, line);
}

/**
 * Like the preview, the search runs to the end of the document, or to the end of the quote that holds
 * the math, a quote line without markers counting as the preview counts it.
 */
function closingLineAfter(context: BlockContext, line: Line): ClosingLine | undefined {
  const enclosingQuotes = enclosingQuoteCount(context);
  let isAfterEmptyQuoteLine = false;
  for (const next of linesAfter(context, line)) {
    const markers = quoteMarkersOf(next.text);
    const content = next.text.slice(markers.length);
    if (markers.count < enclosingQuotes && !continuesQuote(next, content, isAfterEmptyQuoteLine))
      return undefined;
    if (next.text.trimEnd().endsWith(DISPLAY_DELIMITER)) return closingIn(next.from, next.text);
    isAfterEmptyQuoteLine = content.trim() === '';
  }
  return undefined;
}

/** A `$$` line that opens display math of its own ends the quote instead of continuing it. */
function continuesQuote(next: DocumentLine, content: string, isAfterEmptyQuoteLine: boolean): boolean {
  if (!continuesQuoteLazily(content, isAfterEmptyQuoteLine)) return false;
  const opening = /^ {0,3}\$\$/.exec(content);
  if (!opening) return true;
  if (content.slice(opening[0].length).trimEnd().endsWith(DISPLAY_DELIMITER)) return false;
  for (const later of linesFrom(next.from + next.text.length + 1)) {
    if (later.text.trimEnd().endsWith(DISPLAY_DELIMITER)) return false;
  }
  return true;
}

function closingIn(lineStart: number, lineText: string): ClosingLine {
  return { from: lineStart, end: lineStart + lineText.trimEnd().length };
}
