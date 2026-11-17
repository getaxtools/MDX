import { Facet } from '@codemirror/state';

/** The names screen readers hear for rendered blocks, in the app's language. */
export interface RichTextLabels {
  /** "Formula" followed by the formula's source. */
  formula(source: string): string;
  table(rows: number, columns: number): string;
  /** What a collapsed front matter chip says, such as "3 properties". */
  properties(count: number): string;
  diagram(type: string): string;
  /** The name of a task checkbox whose item has no text. */
  task(): string;
  /** Says a table is too large to show as a grid, so it shows as Markdown text. */
  tableTooLarge(): string;
}

/** A callout's look, one of the preview's five, and the title it shows. */
export interface CalloutPresentation {
  readonly look: string;
  readonly title: string;
}

/**
 * How Rich text renders blocks, supplied by the app so that every widget shows exactly the
 * sanitized output the preview would: the editor never renders or sanitizes Markdown itself.
 */
export interface RichTextRendering {
  /** Names the document whose links and pictures `renderBlock` resolves, so renders of two documents never mix. */
  readonly documentKey: string;
  /** Sanitized HTML for Markdown, as the preview renders it for this document. */
  renderBlock(markdown: string): string;
  /** Sanitized HTML for one formula with the preview's typesetting options, or undefined when it fails. */
  typesetMath(tex: string, isDisplay: boolean): Promise<string | undefined>;
  /** Draws a diagram code block of a type the app can draw; absent until the app draws diagrams. */
  readonly drawDiagram?: (type: string, source: string) => Promise<string | undefined>;
  /** Whether `drawDiagram` can draw a code block's language. */
  readonly canDrawDiagram?: (type: string) => boolean;
  /** The look and title of a callout type written as `[!type]`, or undefined for an unknown type. */
  callout(type: string, ownTitle: string): CalloutPresentation | undefined;
  readonly labels: RichTextLabels;
}

export const richTextRenderingFacet = Facet.define<RichTextRendering, RichTextRendering | undefined>({
  combine: (renderings) => renderings[0],
});
