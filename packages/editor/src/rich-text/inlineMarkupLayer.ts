import { syntaxTree } from '@codemirror/language';
import type { EditorState, Range } from '@codemirror/state';
import {
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from '@codemirror/view';
import {
  decorateCodeLines,
  decorateListMark,
  decorateQuote,
  decorateQuoteMark,
} from './blockMarkerDecorators';
import { DecorationsHeldDuringComposition } from './compositionHold';
import type { MarkupContext, VisibleRange } from './markupContext';
import { HEADING_LEVELS } from './richTextClasses';
import {
  atxHeadingDecorator,
  decorateAutolink,
  decorateBareUrl,
  decorateEscape,
  decorateInlineCode,
  decorateLink,
  hideMarksOf,
  setextHeadingDecorator,
  type NodeDecorator,
} from './textMarkupDecorators';

const SETEXT_LEVELS = [1, 2];

const NODE_DECORATORS: ReadonlyMap<string, NodeDecorator> = new Map([
  ['Emphasis', hideMarksOf('EmphasisMark')],
  ['StrongEmphasis', hideMarksOf('EmphasisMark')],
  ['Strikethrough', hideMarksOf('StrikethroughMark')],
  ['InlineCode', decorateInlineCode],
  ...HEADING_LEVELS.map((level) => [`ATXHeading${String(level)}`, atxHeadingDecorator(level)] as const),
  ...SETEXT_LEVELS.map((level) => [`SetextHeading${String(level)}`, setextHeadingDecorator(level)] as const),
  ['Link', decorateLink],
  ['Autolink', decorateAutolink],
  ['URL', decorateBareUrl],
  ['Escape', decorateEscape],
  ['Blockquote', decorateQuote],
  ['QuoteMark', decorateQuoteMark],
  ['ListMark', decorateListMark],
  ['FencedCode', decorateCodeLines],
  ['CodeBlock', decorateCodeLines],
  ['FrontMatter', decorateCodeLines],
]);
/** Pictures become widgets of their own; their alternative text keeps its Markdown until then. */
const SKIPPED_NODES = new Set(['Image']);

let editorCount = 0;

/** Hidden markers and styled text for the parts of the document in view, never for the rest. */
export function inlineMarkupDecorations(
  state: EditorState,
  visibleRanges: readonly VisibleRange[],
  idPrefix: string,
): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const tree = syntaxTree(state);
  for (const visible of visibleRanges) {
    const context: MarkupContext = { state, visible, decorations, idPrefix };
    tree.iterate({
      from: visible.from,
      to: visible.to,
      enter: (node) => {
        if (SKIPPED_NODES.has(node.name)) return false;
        NODE_DECORATORS.get(node.name)?.(node.node, context);
        return undefined;
      },
    });
  }
  return Decoration.set(decorations, true);
}

function isRebuildNeeded(update: ViewUpdate): boolean {
  return (
    update.docChanged ||
    update.viewportChanged ||
    update.selectionSet ||
    syntaxTree(update.state) !== syntaxTree(update.startState)
  );
}

class InlineMarkupLayer {
  readonly held: DecorationsHeldDuringComposition;

  constructor(view: EditorView) {
    editorCount += 1;
    const idPrefix = `mdx-rich-text-${String(editorCount)}`;
    this.held = new DecorationsHeldDuringComposition(view, (shownView) =>
      inlineMarkupDecorations(shownView.state, shownView.visibleRanges, idPrefix),
    );
  }

  get decorations(): DecorationSet {
    return this.held.decorations;
  }

  update(update: ViewUpdate): void {
    this.held.update(update, isRebuildNeeded(update));
  }

  destroy(): void {
    this.held.destroy();
  }
}

/** Rich text's inline layer: markers hidden away from every selection, in the visible ranges only. */
export const inlineMarkupLayer = ViewPlugin.fromClass(InlineMarkupLayer, {
  decorations: (layer) => layer.decorations,
  eventObservers: {
    compositionend() {
      this.held.compositionEnded();
    },
  },
});
