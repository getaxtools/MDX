import { syntaxTree } from '@codemirror/language';
import { EditorSelection, type EditorState, type SelectionRange, type StateCommand } from '@codemirror/state';
import type { SyntaxNode } from '../syntax/syntaxNode';
import { documentStyleOf, type DocumentStyle } from './documentStyle';
import { markerToggleOf, type RangeChange } from './toggleInlineMarker';

export type InlineFormat = 'strong' | 'emphasis' | 'strikethrough' | 'inlineCode';

interface InlineFormatSyntax {
  readonly nodeName: string;
  readonly markName: string;
  readonly markerIn: (style: DocumentStyle) => string;
}

export const INLINE_FORMAT_SYNTAX: Readonly<Record<InlineFormat, InlineFormatSyntax>> = {
  strong: { nodeName: 'StrongEmphasis', markName: 'EmphasisMark', markerIn: (style) => style.strongMarker },
  emphasis: { nodeName: 'Emphasis', markName: 'EmphasisMark', markerIn: (style) => style.emphasisMarker },
  strikethrough: { nodeName: 'Strikethrough', markName: 'StrikethroughMark', markerIn: () => '~~' },
  inlineCode: { nodeName: 'InlineCode', markName: 'CodeMark', markerIn: () => '`' },
};

/** The innermost node of a kind that holds the whole range, its markers included. */
export function enclosingNode(
  state: EditorState,
  range: SelectionRange,
  nodeName: string,
): SyntaxNode | undefined {
  for (
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(range.from, 1);
    node;
    node = node.parent
  ) {
    if (node.name === nodeName && node.from <= range.from && node.to >= range.to) return node;
  }
  return undefined;
}

function removedMarkers(
  state: EditorState,
  range: SelectionRange,
  marks: readonly SyntaxNode[],
): RangeChange {
  const changes = marks.map((mark) => ({ from: mark.from, to: mark.to }));
  const changeSet = state.changes(changes);
  return {
    changes,
    range: EditorSelection.range(changeSet.mapPos(range.anchor, -1), changeSet.mapPos(range.head, -1)),
  };
}

/**
 * Formats the selection with the document's own markers, such as `_` in a document that writes
 * `_emphasis_`; inside text that already has the format, it removes that text's markers instead.
 */
export function toggleInlineFormat(format: InlineFormat): StateCommand {
  const syntax = INLINE_FORMAT_SYNTAX[format];
  return ({ state, dispatch }) => {
    const marker = syntax.markerIn(documentStyleOf(state));
    const transaction = state.changeByRange((range) => {
      const node = enclosingNode(state, range, syntax.nodeName);
      return node
        ? removedMarkers(state, range, node.getChildren(syntax.markName))
        : markerToggleOf(state, range, marker);
    });
    dispatch(state.update(transaction, { userEvent: 'input.format', scrollIntoView: true }));
    return true;
  };
}
