import {
  EditorSelection,
  type ChangeSpec,
  type EditorState,
  type Line,
  type StateCommand,
} from '@codemirror/state';
import { documentStyleOf, type DocumentStyle } from './documentStyle';

export type LinePrefixKind = 'bulletList' | 'numberedList' | 'taskList' | 'quote';

const LIST_MARKER = /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/;
const QUOTE_MARKER = /^(\s*)>\s?/;
const HEADING_MARKER = /^(#{1,6})\s+/;

const PREFIX_PATTERNS: Readonly<Record<LinePrefixKind, RegExp>> = {
  bulletList: /^(\s*)[-*+]\s+(?!\[[ xX]\]\s)/,
  numberedList: /^(\s*)\d+[.)]\s+/,
  taskList: /^(\s*)[-*+]\s+\[[ xX]\]\s+/,
  quote: QUOTE_MARKER,
};

/**
 * Turns the selected lines into a bullet, numbered or task list, or a quote, with the document's own
 * bullet and number style; or back into plain lines. On an empty line it starts the list or quote.
 */
export function toggleLinePrefix(kind: LinePrefixKind): StateCommand {
  return ({ state, dispatch }) => {
    const style = documentStyleOf(state);
    const lines = selectedLines(state).filter((line) => line.text.trim() !== '');
    if (lines.length === 0) {
      dispatch(state.update(prefixOnEmptyLine(state, prefixFor(kind, 1, style))));
      return true;
    }
    const pattern = PREFIX_PATTERNS[kind];
    const isAlreadyApplied = lines.every((line) => pattern.test(line.text));
    const existingMarker = kind === 'quote' ? QUOTE_MARKER : LIST_MARKER;
    const changes: ChangeSpec[] = lines.map((line, index) => {
      const markerLength = isAlreadyApplied
        ? markerLengthOf(line.text, pattern)
        : markerLengthOf(line.text, existingMarker);
      const indentation = /^\s*/.exec(line.text)?.[0] ?? '';
      const insert = isAlreadyApplied ? indentation : indentation + prefixFor(kind, index + 1, style);
      return { from: line.from, to: line.from + Math.max(markerLength, indentation.length), insert };
    });
    dispatch(state.update({ changes, userEvent: 'input.format', scrollIntoView: true }));
    return true;
  };
}

/** Makes the selected heading lines paragraphs again. */
export const toParagraph: StateCommand = ({ state, dispatch }) => {
  const changes: ChangeSpec[] = selectedLines(state).map((line) => ({
    from: line.from,
    to: line.from + (HEADING_MARKER.exec(line.text)?.[0].length ?? 0),
  }));
  dispatch(state.update({ changes, userEvent: 'input.format', scrollIntoView: true }));
  return true;
};

/** Makes the selected lines headings of a level, or plain paragraphs when they already are. */
export function toggleHeading(level: number): StateCommand {
  return ({ state, dispatch }) => {
    const lines = selectedLines(state);
    const isAlreadyApplied = lines.every((line) => HEADING_MARKER.exec(line.text)?.[1]?.length === level);
    const changes: ChangeSpec[] = lines.map((line) => {
      const markerLength = HEADING_MARKER.exec(line.text)?.[0].length ?? 0;
      const insert = isAlreadyApplied ? '' : `${'#'.repeat(level)} `;
      return { from: line.from, to: line.from + markerLength, insert };
    });
    dispatch(state.update({ changes, userEvent: 'input.format', scrollIntoView: true }));
    return true;
  };
}

/** The Markdown that starts a line of a kind, the same text the insert menu writes. */
export function prefixFor(kind: LinePrefixKind, number: number, style: DocumentStyle): string {
  if (kind === 'numberedList') return `${String(number)}${style.orderedDelimiter} `;
  if (kind === 'taskList') return `${style.bulletMarker} [ ] `;
  return kind === 'quote' ? '> ' : `${style.bulletMarker} `;
}

function prefixOnEmptyLine(state: EditorState, prefix: string) {
  const line = state.doc.lineAt(state.selection.main.head);
  return {
    changes: { from: line.from, to: line.to, insert: prefix },
    selection: EditorSelection.cursor(line.from + prefix.length),
    userEvent: 'input.format',
    scrollIntoView: true,
  };
}

function markerLengthOf(text: string, pattern: RegExp): number {
  return pattern.exec(text)?.[0].length ?? 0;
}

function selectedLines(state: EditorState): Line[] {
  const lineNumbers = new Set<number>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let number = first; number <= last; number += 1) lineNumbers.add(number);
  }
  return [...lineNumbers].sort((first, second) => first - second).map((number) => state.doc.line(number));
}
