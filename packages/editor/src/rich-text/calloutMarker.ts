import type { EditorState, TransactionSpec } from '@codemirror/state';

/** The preview's callout marker: `[!type]`, an optional fold sign, then an optional title. */
const CALLOUT_MARKER = /^\[!([a-z][\w-]*)\]([+-]?)(?:[ \t]+(.*?))?[ \t]*$/i;
const QUOTE_MARKER_RUN = /^(?:[ \t]{0,3}>[ \t]?)+/;
const MARKER_OPENING = '[!';

/** `-` starts collapsed, `+` starts expanded, and a callout without either cannot fold. */
export type CalloutFoldSign = '' | '+' | '-';

/** A callout's first line, with document positions for the parts its commands edit. */
export interface CalloutLine {
  /** Where `[!type]` starts, after the quote markers. */
  readonly markerFrom: number;
  readonly lineTo: number;
  readonly type: string;
  readonly typeFrom: number;
  readonly typeTo: number;
  readonly foldSign: CalloutFoldSign;
  /** Where the fold sign is, or goes when there is none: right after the closing bracket. */
  readonly foldSignAt: number;
  readonly title: string;
}

/** The callout a line opens, read after its quote markers; undefined for any other line. */
export function calloutLineAt(state: EditorState, lineStart: number): CalloutLine | undefined {
  const line = state.doc.lineAt(lineStart);
  const markers = QUOTE_MARKER_RUN.exec(line.text)?.[0] ?? '';
  if (markers === '') return undefined;
  const match = CALLOUT_MARKER.exec(line.text.slice(markers.length));
  if (!match) return undefined;
  const type = match[1] ?? '';
  const markerFrom = line.from + markers.length;
  const typeFrom = markerFrom + MARKER_OPENING.length;
  const sign = match[2];
  const foldSign: CalloutFoldSign = sign === '+' || sign === '-' ? sign : '';
  return {
    markerFrom,
    lineTo: line.to,
    type,
    typeFrom,
    typeTo: typeFrom + type.length,
    foldSign,
    foldSignAt: typeFrom + type.length + 1,
    title: match[3] ?? '',
  };
}

const CALLOUT_TYPE_WORD = /^[a-z][\w-]*$/i;

/**
 * The callout type menu: replaces only the type word, written in capitals when the callout's own
 * type was; undefined when the text there is no longer a type word.
 */
export function calloutTypeChange(
  state: EditorState,
  range: { readonly from: number; readonly to: number },
  type: string,
): TransactionSpec | undefined {
  const current = state.sliceDoc(range.from, range.to);
  if (
    !CALLOUT_TYPE_WORD.test(current) ||
    state.sliceDoc(range.from - MARKER_OPENING.length, range.from) !== MARKER_OPENING
  )
    return undefined;
  const isCapitals = current === current.toUpperCase();
  const insert = isCapitals ? type.toUpperCase() : type.toLowerCase();
  if (insert === current) return undefined;
  return { changes: { from: range.from, to: range.to, insert }, userEvent: 'input.callout' };
}
