export interface TextLine {
  readonly start: number;
  /** Where the line's text ends, before its line break. */
  readonly end: number;
  readonly text: string;
}

export type QuoteStyle = 'plain' | 'single' | 'double';

/** One value as it is written in the file: where it is, including any quotes, and what it means. */
export interface WrittenScalar {
  readonly start: number;
  readonly end: number;
  readonly style: QuoteStyle;
  readonly written: string;
  readonly value: string;
}

export interface DashItem {
  readonly line: TextLine;
  readonly indentation: string;
  readonly scalar: WrittenScalar;
}

export type EntryValue =
  | {
      readonly kind: 'empty';
      readonly insertAt: number;
      readonly hasSpaceBefore: boolean;
      readonly hasCommentAfter: boolean;
    }
  | { readonly kind: 'scalar'; readonly scalar: WrittenScalar }
  | {
      readonly kind: 'inlineList';
      /** Where the list is, from `[` to just after `]`. */
      readonly start: number;
      readonly end: number;
      /** Where the first item is, or would be: after `[` and any spaces. */
      readonly itemsStart: number;
      readonly items: readonly WrittenScalar[];
      /** What is written between each item and the next, such as `, ` or `,`. */
      readonly separators: readonly string[];
    }
  | { readonly kind: 'dashList'; readonly items: readonly DashItem[] };

export interface FrontMatterEntry {
  readonly key: string;
  readonly keyLine: TextLine;
  readonly value: EntryValue;
}

export interface FrontMatterLayout {
  readonly closingFence: TextLine;
  /** The line break after the opening fence, used for any line the edit adds. */
  readonly lineBreak: string;
  readonly entries: readonly FrontMatterEntry[];
}

type ScalarContext = 'block' | 'flow';

interface ScannedScalar {
  readonly style: QuoteStyle;
  readonly value: string;
  /** Index in the line just after the value. */
  readonly end: number;
}

export const BYTE_ORDER_MARK = '\u{FEFF}';
const ANY_LINE_BREAK = /\r\n|\r|\n/g;
const FENCE = /^---[ \t]*$/;
const CLOSING_FENCE = /^(---|\.\.\.)[ \t]*$/;
const KEY_LINE = /^([A-Za-z0-9_][\w-]*):(.*)$/s;
const DASH_ITEM = /^( *)- (.*)$/s;
const SPACES = /^[ \t]*/;
/** YAML spaces are only spaces and tabs; other Unicode spaces are part of a value. */
const TRAILING_SPACES = /[ \t]+$/;
const BLANK_OR_COMMENT_LINE = /^[ \t]*(?:#.*)?$/s;
/** What may follow a value on its line: nothing, or a comment after a space. */
const LINE_TRAILER = /^(?:[ \t]+#.*)?[ \t]*$/s;
/** Block scalars, anchors, aliases, tags, flow maps and reserved marks need a real YAML editor. */
const COMPLEX_PLAIN_START = /^(?:[|>&*!{}[\]%@`#,]|[-?:](?:[ \t]|$))/;
const PLAIN_END_IN_BLOCK = /[ \t]#/;
const PLAIN_END_IN_FLOW = /[,\]]/;
const MAPPING_INSIDE_PLAIN = /:(?:[ \t]|$)/;
const FLOW_MARKS = /[[\]{}]/;

/**
 * Reads front matter written only as `key: value`, inline `[a, b]` lists and `- item` lists, with
 * where every value is in the text. Anything else is `'complex'`; no front matter is undefined.
 */
export function readFrontMatterLayout(text: string): FrontMatterLayout | 'complex' | undefined {
  const lines: TextLine[] = [];
  for (const line of linesFrom(text)) {
    if (lines.length === 0 && !isOpeningFence(line)) return undefined;
    if (lines.length > 0 && CLOSING_FENCE.test(line.text)) return layoutOf(text, lines, line);
    lines.push(line);
  }
  return undefined;
}

function layoutOf(
  text: string,
  lines: readonly TextLine[],
  closingFence: TextLine,
): FrontMatterLayout | 'complex' {
  const entries = entriesOf(lines.slice(1));
  if (entries === 'complex') return 'complex';
  const openingFence = lines[0] ?? closingFence;
  const lineBreak = text.slice(openingFence.end, (lines[1] ?? closingFence).start);
  return { closingFence, lineBreak, entries };
}

function isOpeningFence(line: TextLine): boolean {
  return FENCE.test(
    line.text.startsWith(BYTE_ORDER_MARK) ? line.text.slice(BYTE_ORDER_MARK.length) : line.text,
  );
}

/** The lines of a text one by one, so a reader can stop before the end of a long document. */
export function* linesFrom(text: string): Generator<TextLine> {
  let start = 0;
  for (const match of text.matchAll(ANY_LINE_BREAK)) {
    yield { start, end: match.index, text: text.slice(start, match.index) };
    start = match.index + match[0].length;
  }
  yield { start, end: text.length, text: text.slice(start) };
}

function entriesOf(lines: readonly TextLine[]): FrontMatterEntry[] | 'complex' {
  const entries: FrontMatterEntry[] = [];
  for (const line of lines) {
    if (BLANK_OR_COMMENT_LINE.test(line.text)) continue;
    const entry = KEY_LINE.test(line.text) ? entryOf(line) : withDashItem(entries.pop(), line);
    if (entry === 'complex' || entries.some((earlier) => earlier.key === entry.key)) return 'complex';
    entries.push(entry);
  }
  return entries;
}

function entryOf(line: TextLine): FrontMatterEntry | 'complex' {
  const key = KEY_LINE.exec(line.text)?.[1] ?? '';
  const valueFrom = key.length + 1;
  const valueStart = skipSpaces(line.text, valueFrom);
  const hasSpaceBefore = valueStart > valueFrom;
  const rest = line.text.slice(valueStart);
  if (rest !== '' && !hasSpaceBefore) return 'complex';
  if (rest === '' || rest.startsWith('#')) {
    const insertAt = line.start + valueStart;
    const value: EntryValue = { kind: 'empty', insertAt, hasSpaceBefore, hasCommentAfter: rest !== '' };
    return { key, keyLine: line, value };
  }
  const value = rest.startsWith('[') ? inlineListAt(line, valueStart) : blockScalarAt(line, valueStart);
  return value === 'complex' ? 'complex' : { key, keyLine: line, value };
}

/** A dash item belongs to the key above it only when that key has no value of its own. */
function withDashItem(entry: FrontMatterEntry | undefined, line: TextLine): FrontMatterEntry | 'complex' {
  const match = DASH_ITEM.exec(line.text);
  if (!entry || !match) return 'complex';
  const indentation = match[1] ?? '';
  const existingItems = entry.value.kind === 'dashList' ? entry.value.items : [];
  const isFirstItem = entry.value.kind === 'empty' && !entry.value.hasCommentAfter;
  const isSameIndentation = existingItems[0]?.indentation === indentation;
  if (!isFirstItem && !isSameIndentation) return 'complex';
  const scalar = blockScalarAt(line, indentation.length + 2);
  if (scalar === 'complex') return 'complex';
  const items = [...existingItems, { line, indentation, scalar: scalar.scalar }];
  return { ...entry, value: { kind: 'dashList', items } };
}

function blockScalarAt(line: TextLine, from: number): { kind: 'scalar'; scalar: WrittenScalar } | 'complex' {
  const start = skipSpaces(line.text, from);
  const scanned = scanScalar(line.text, start, 'block');
  if (!scanned || !LINE_TRAILER.test(line.text.slice(scanned.end))) return 'complex';
  return { kind: 'scalar', scalar: writtenScalar(line, start, scanned) };
}

function inlineListAt(line: TextLine, from: number): EntryValue | 'complex' {
  const firstItemAt = skipSpaces(line.text, from + 1);
  const scanned =
    line.text[firstItemAt] === ']'
      ? { items: [], separators: [], closingAt: firstItemAt }
      : inlineItemsAt(line, firstItemAt);
  if (!scanned) return 'complex';
  const end = scanned.closingAt + 1;
  if (!LINE_TRAILER.test(line.text.slice(end))) return 'complex';
  return {
    kind: 'inlineList',
    start: line.start + from,
    end: line.start + end,
    itemsStart: line.start + firstItemAt,
    items: scanned.items,
    separators: scanned.separators,
  };
}

function inlineItemsAt(
  line: TextLine,
  from: number,
): { items: WrittenScalar[]; separators: string[]; closingAt: number } | undefined {
  const items: WrittenScalar[] = [];
  const separators: string[] = [];
  for (let index = from; ;) {
    const scanned = scanScalar(line.text, index, 'flow');
    if (!scanned) return undefined;
    items.push(writtenScalar(line, index, scanned));
    const afterItem = skipSpaces(line.text, scanned.end);
    if (line.text[afterItem] === ']') return { items, separators, closingAt: afterItem };
    if (line.text[afterItem] !== ',') return undefined;
    index = skipSpaces(line.text, afterItem + 1);
    separators.push(line.text.slice(scanned.end, index));
  }
}

function writtenScalar(line: TextLine, from: number, scanned: ScannedScalar): WrittenScalar {
  return {
    start: line.start + from,
    end: line.start + scanned.end,
    style: scanned.style,
    written: line.text.slice(from, scanned.end),
    value: scanned.value,
  };
}

function scanScalar(text: string, from: number, context: ScalarContext): ScannedScalar | undefined {
  if (text[from] === '"') return scanDoubleQuoted(text, from);
  if (text[from] === "'") return scanSingleQuoted(text, from);
  return scanPlain(text, from, context);
}

function scanPlain(text: string, from: number, context: ScalarContext): ScannedScalar | undefined {
  const rest = text.slice(from);
  if (COMPLEX_PLAIN_START.test(rest)) return undefined;
  const stop = (context === 'block' ? PLAIN_END_IN_BLOCK : PLAIN_END_IN_FLOW).exec(rest)?.index;
  const value = rest.slice(0, stop).replace(TRAILING_SPACES, '');
  if (value === '' || MAPPING_INSIDE_PLAIN.test(value)) return undefined;
  if (context === 'flow' && (FLOW_MARKS.test(value) || PLAIN_END_IN_BLOCK.test(value))) return undefined;
  return { style: 'plain', value, end: from + value.length };
}

/** Only `\"` and `\\` are read; any other escape is left to a real YAML editor. */
function scanDoubleQuoted(text: string, from: number): ScannedScalar | undefined {
  let value = '';
  for (let index = from + 1; index < text.length; index += 1) {
    const character = text.charAt(index);
    if (character === '"') return { style: 'double', value, end: index + 1 };
    if (character === '\\') {
      const escaped = text[index + 1];
      if (escaped !== '"' && escaped !== '\\') return undefined;
      value += escaped;
      index += 1;
    } else value += character;
  }
  return undefined;
}

function scanSingleQuoted(text: string, from: number): ScannedScalar | undefined {
  let value = '';
  for (let index = from + 1; index < text.length; index += 1) {
    if (text[index] !== "'") value += text.charAt(index);
    else if (text[index + 1] === "'") {
      value += "'";
      index += 1;
    } else return { style: 'single', value, end: index + 1 };
  }
  return undefined;
}

function skipSpaces(text: string, from: number): number {
  return from + (SPACES.exec(text.slice(from))?.[0].length ?? 0);
}
