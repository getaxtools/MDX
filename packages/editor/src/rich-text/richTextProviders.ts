import { Facet, type EditorState, type Range } from '@codemirror/state';
import type { Decoration, WidgetType } from '@codemirror/view';
import type { VisibleRange } from './markupContext';
import type { SyntaxNode } from '../syntax/syntaxNode';

/** A block of the document a block provider may show as a widget. */
export interface RichTextBlock {
  readonly state: EditorState;
  /** The syntax node's name, such as `Table` or `FencedCode`. */
  readonly name: string;
  readonly node: SyntaxNode;
  /** From the start of the block's first line to the end of its last line. */
  readonly from: number;
  readonly to: number;
  readonly source: string;
}

/**
 * Shows blocks of some kinds as widgets. The host replaces a block by its widget only while no
 * selection touches it, holds widgets still during input method composition and turns them off in
 * Source, so a provider cannot break those rules.
 */
export interface RichTextBlockProvider {
  /** The syntax nodes this provider looks at, such as `['Table']`. */
  readonly nodeNames: readonly string[];
  /** The widget for a block, or undefined to leave it as text. */
  widgetFor(block: RichTextBlock): WidgetType | undefined;
  /** Decorations kept while a selection is in the block, such as a grid's highlight of the live cell. */
  decorationsWhileRevealed?(block: RichTextBlock): readonly Range<Decoration>[];
}

/** Adds decorations to the lines in view; replacing decorations are dropped where a selection touches them. */
export interface RichTextInlineProvider {
  decorate(state: EditorState, visible: VisibleRange): readonly Range<Decoration>[];
}

export interface RichTextProviders {
  readonly blocks?: readonly RichTextBlockProvider[];
  readonly inline?: readonly RichTextInlineProvider[];
}

/** Providers set by the workspace kind and by later editor features. */
export const richTextProvidersFacet = Facet.define<RichTextProviders, Required<RichTextProviders>>({
  combine: (all) => ({
    blocks: all.flatMap((providers) => providers.blocks ?? []),
    inline: all.flatMap((providers) => providers.inline ?? []),
  }),
});

/** A provider that throws leaves its block or line as text instead of breaking the editor. */
export function withoutFailures<Result>(produce: () => Result, fallback: Result): Result {
  try {
    return produce();
  } catch {
    return fallback;
  }
}
