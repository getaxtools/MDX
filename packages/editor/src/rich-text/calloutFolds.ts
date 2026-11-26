import {
  codeFolding,
  ensureSyntaxTree,
  foldEffect,
  foldedRanges,
  syntaxTree,
  unfoldEffect,
} from '@codemirror/language';
import type { EditorState, Extension, StateEffect, TransactionSpec } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';
import { calloutLineAt, type CalloutLine } from './calloutMarker';
import type { SyntaxNode } from '../syntax/syntaxNode';

/** The lines a folded callout hides: from the end of its title line to the end of its last line. */
export interface CalloutFoldRange {
  readonly from: number;
  readonly to: number;
}

const FOLDED_PLACEHOLDER_CLASS = 'cm-rich-callout-folded';
const PARSE_TIMEOUT_MS = 200;

/** A quote's body lines, if it has any below its first line. */
export function calloutFoldRangeOf(state: EditorState, quote: SyntaxNode): CalloutFoldRange | undefined {
  const firstLine = state.doc.lineAt(quote.from);
  const lastLine = state.doc.lineAt(
    quote.to > quote.from && state.doc.lineAt(quote.to).from === quote.to ? quote.to - 1 : quote.to,
  );
  return lastLine.number > firstLine.number ? { from: firstLine.to, to: lastLine.to } : undefined;
}

export function isCalloutFolded(state: EditorState, range: CalloutFoldRange): boolean {
  let isFolded = false;
  foldedRanges(state).between(range.from, range.from, (from, to) => {
    if (from === range.from && to === range.to) isFolded = true;
  });
  return isFolded;
}

/** Expands or collapses a callout in this view only; the document does not change. */
export function toggleCalloutFold(view: EditorView, range: CalloutFoldRange): void {
  const effect = isCalloutFolded(view.state, range) ? unfoldEffect.of(range) : foldEffect.of(range);
  view.dispatch({ effects: effect });
}

/** Folds for the callouts written to start collapsed, with `-` after their type. */
function collapsedCalloutFolds(state: EditorState): StateEffect<CalloutFoldRange>[] {
  const tree = ensureSyntaxTree(state, state.doc.length, PARSE_TIMEOUT_MS) ?? syntaxTree(state);
  const effects: StateEffect<CalloutFoldRange>[] = [];
  tree.iterate({
    enter: (node) => {
      if (node.name !== 'Blockquote') return undefined;
      const range =
        calloutLineAt(state, node.from)?.foldSign === '-' ? calloutFoldRangeOf(state, node.node) : undefined;
      if (range) effects.push(foldEffect.of(range));
      return false;
    },
  });
  return effects;
}

/** Callouts written with `-` start collapsed whenever Rich text starts showing the document. */
const startCollapsedCallouts = ViewPlugin.define((view) => {
  let isShown = true;
  // A view may not be changed while it is being set up, so the folds follow right after.
  void Promise.resolve().then(() => {
    const effects = collapsedCalloutFolds(view.state);
    if (isShown && effects.length > 0) view.dispatch({ effects });
  });
  return {
    destroy: () => {
      isShown = false;
    },
  };
});

/** Folding for callouts, kept as view state; a caret moved into a folded callout unfolds it. */
export function calloutFolding(): Extension {
  return [
    codeFolding({
      placeholderDOM: (view) => {
        const placeholder = view.dom.ownerDocument.createElement('span');
        placeholder.className = FOLDED_PLACEHOLDER_CLASS;
        placeholder.setAttribute('aria-hidden', 'true');
        return placeholder;
      },
    }),
    startCollapsedCallouts,
  ];
}

/**
 * Start collapsed or Start expanded: writes `-` or `+` after the callout's type, changing one
 * character, or nothing when the callout already starts that way.
 */
export function calloutStartChange(
  callout: CalloutLine,
  start: 'collapsed' | 'expanded',
): TransactionSpec | undefined {
  const sign = start === 'collapsed' ? '-' : '+';
  if (callout.foldSign === sign) return undefined;
  const to = callout.foldSign === '' ? callout.foldSignAt : callout.foldSignAt + 1;
  return { changes: { from: callout.foldSignAt, to, insert: sign }, userEvent: 'input.callout' };
}
