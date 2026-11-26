import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';

/** The Markdown a document already writes, so new formatting matches it. */
export interface DocumentStyle {
  readonly emphasisMarker: string;
  readonly strongMarker: string;
  readonly bulletMarker: string;
  /** `.` as in `1.`, or `)` as in `1)`. */
  readonly orderedDelimiter: string;
}

const DEFAULT_STYLE: DocumentStyle = {
  emphasisMarker: '*',
  strongMarker: '**',
  bulletMarker: '-',
  orderedDelimiter: '.',
};

type StyleFinding = Partial<Record<keyof DocumentStyle, string>>;

const STYLE_KEYS: readonly (keyof DocumentStyle)[] = [
  'emphasisMarker',
  'strongMarker',
  'bulletMarker',
  'orderedDelimiter',
];

function findingOf(
  state: EditorState,
  { name, from, to }: { readonly name: string; readonly from: number; readonly to: number },
): StyleFinding {
  const text = state.sliceDoc(from, to);
  if (name === 'EmphasisMark') {
    return text.length === 1 ? { emphasisMarker: text } : { strongMarker: text };
  }
  if (name !== 'ListMark') return {};
  return /^\d/.test(text) ? { orderedDelimiter: text.slice(-1) } : { bulletMarker: text };
}

/** The first emphasis, strong, bullet and numbered markers of the parsed document, each kind once. */
export function documentStyleOf(state: EditorState): DocumentStyle {
  const found: StyleFinding = {};
  syntaxTree(state).iterate({
    enter: (node) => {
      if (STYLE_KEYS.every((key) => found[key] !== undefined)) return false;
      const finding = findingOf(state, node);
      for (const key of STYLE_KEYS) {
        const value = finding[key];
        if (found[key] === undefined && value !== undefined) found[key] = value;
      }
      return undefined;
    },
  });
  return { ...DEFAULT_STYLE, ...found };
}
