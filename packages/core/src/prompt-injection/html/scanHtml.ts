import { decodeCharacterReferences } from '../decoders/decodeCharacterReferences';
import type { SourceRange } from '../DocumentStructure';

export interface HtmlOpenTag {
  readonly kind: 'openTag';
  /** Lower case. */
  readonly name: string;
  /** Names in lower case; values with character references decoded. */
  readonly attributes: ReadonlyMap<string, string>;
  readonly from: number;
  readonly to: number;
  readonly isSelfClosing: boolean;
}

export interface HtmlCloseTag {
  readonly kind: 'closeTag';
  readonly name: string;
  readonly from: number;
  readonly to: number;
}

export interface HtmlComment {
  readonly kind: 'comment';
  readonly from: number;
  readonly to: number;
  readonly content: string;
}

export type HtmlItem = HtmlOpenTag | HtmlCloseTag | HtmlComment;

interface ScanState {
  readonly text: string;
  readonly end: number;
  readonly rawTextElements: ReadonlySet<string>;
  readonly items: HtmlItem[];
}

const TAG_NAME = /[A-Za-z][A-Za-z0-9:-]*/y;
const WHITESPACE = /\s/;
const ATTRIBUTE_NAME_END = /[\s/>=]/;
const UNQUOTED_VALUE_END = /[\s>]/;
const COMMENT_START = '<!--';
const COMMENT_END = '-->';

/**
 * A small tag, attribute and comment scanner for raw HTML in Markdown, for workers that have no DOM
 * parser. It is not a sanitizer: a wrong parse can only miss a finding, and it never throws.
 */
export function scanHtml(text: string, range: SourceRange, rawTextElements: ReadonlySet<string>): HtmlItem[] {
  const state: ScanState = { text, end: Math.min(range.to, text.length), rawTextElements, items: [] };
  let offset = range.from;
  while (offset < state.end) {
    const tagStart = text.indexOf('<', offset);
    if (tagStart < 0 || tagStart >= state.end) break;
    offset = scanItemAt(state, tagStart);
  }
  return state.items;
}

function scanItemAt(state: ScanState, tagStart: number): number {
  const { text } = state;
  if (text.startsWith(COMMENT_START, tagStart)) return scanComment(state, tagStart);
  if (text.startsWith('</', tagStart)) return scanCloseTag(state, tagStart);
  if (text.startsWith('<!', tagStart) || text.startsWith('<?', tagStart)) return endOfTag(state, tagStart);
  return scanOpenTag(state, tagStart);
}

function endOfTag(state: ScanState, from: number): number {
  const closing = state.text.indexOf('>', from);
  return closing < 0 || closing >= state.end ? state.end : closing + 1;
}

function scanComment(state: ScanState, from: number): number {
  const closing = state.text.indexOf(COMMENT_END, from + COMMENT_START.length);
  const isClosed = closing >= 0 && closing + COMMENT_END.length <= state.end;
  const contentEnd = isClosed ? closing : state.end;
  const to = isClosed ? closing + COMMENT_END.length : state.end;
  state.items.push({
    kind: 'comment',
    from,
    to,
    content: state.text.slice(from + COMMENT_START.length, contentEnd),
  });
  return to;
}

function tagNameAt(text: string, offset: number): string | undefined {
  TAG_NAME.lastIndex = offset;
  return TAG_NAME.exec(text)?.[0].toLowerCase();
}

function scanCloseTag(state: ScanState, from: number): number {
  const name = tagNameAt(state.text, from + 2);
  if (name === undefined) return from + 1;
  const to = endOfTag(state, from);
  state.items.push({ kind: 'closeTag', name, from, to });
  return to;
}

function scanOpenTag(state: ScanState, from: number): number {
  const name = tagNameAt(state.text, from + 1);
  if (name === undefined) return from + 1;
  const { attributes, to, isSelfClosing } = readAttributes(state, from + 1 + name.length);
  state.items.push({ kind: 'openTag', name, attributes, from, to, isSelfClosing });
  if (isSelfClosing || !state.rawTextElements.has(name)) return to;
  const closingTag = new RegExp(`</${name}`, 'gi');
  closingTag.lastIndex = to;
  const closing = closingTag.exec(state.text)?.index ?? -1;
  return closing < 0 || closing >= state.end ? state.end : closing;
}

interface AttributeReading {
  readonly attributes: ReadonlyMap<string, string>;
  readonly to: number;
  readonly isSelfClosing: boolean;
}

function skipWhitespace(state: ScanState, offset: number): number {
  let position = offset;
  while (position < state.end && WHITESPACE.test(state.text.charAt(position))) position += 1;
  return position;
}

function readUntil(state: ScanState, offset: number, stop: RegExp): number {
  let position = offset;
  while (position < state.end && !stop.test(state.text.charAt(position))) position += 1;
  return position;
}

function readAttributes(state: ScanState, offset: number): AttributeReading {
  const attributes = new Map<string, string>();
  let position = offset;
  while (position < state.end) {
    position = skipWhitespace(state, position);
    if (state.text.startsWith('/>', position)) return { attributes, to: position + 2, isSelfClosing: true };
    if (state.text.charAt(position) === '>') return { attributes, to: position + 1, isSelfClosing: false };
    const nameEnd = readUntil(state, position, ATTRIBUTE_NAME_END);
    if (nameEnd === position) {
      position += 1;
      continue;
    }
    const name = state.text.slice(position, nameEnd).toLowerCase();
    const value = readAttributeValue(state, skipWhitespace(state, nameEnd));
    if (!attributes.has(name)) attributes.set(name, decodeCharacterReferences(value.text));
    position = value.to;
  }
  return { attributes, to: state.end, isSelfClosing: false };
}

function readAttributeValue(state: ScanState, offset: number): { text: string; to: number } {
  if (state.text.charAt(offset) !== '=') return { text: '', to: offset };
  const valueStart = skipWhitespace(state, offset + 1);
  const quote = state.text.charAt(valueStart);
  if (quote === '"' || quote === "'") {
    const closing = state.text.indexOf(quote, valueStart + 1);
    const valueEnd = closing < 0 || closing >= state.end ? state.end : closing;
    return { text: state.text.slice(valueStart + 1, valueEnd), to: Math.min(state.end, valueEnd + 1) };
  }
  const valueEnd = readUntil(state, valueStart, UNQUOTED_VALUE_END);
  return { text: state.text.slice(valueStart, valueEnd), to: valueEnd };
}
