import { Facet } from '@codemirror/state';
import type { EditorView, WidgetType } from '@codemirror/view';
import { isComposing } from './compositionHold';
import { lineCountOf, RenderedWidget, renderingOf, settleRenderedHtml } from './renderedWidgets';
import { EMBED_CLASS, EMBED_CONTENT_CLASS, EMBED_NOT_FOUND_CLASS } from './richTextClasses';
import type { RichTextBlockProvider } from './richTextProviders';
import { richTextRenderingFacet } from './richTextRendering';

/**
 * How the workspace kind shows embeds, such as a Notes workspace's `![[Note]]`. The kind decides the
 * syntax and what a target means, and limits depth and cycles; the editor only hosts the result.
 */
export interface EmbedResolver {
  /** The target an embed block names, or undefined when the block is not an embed. */
  targetOf(source: string): string | undefined;
  /** The embedded Markdown, or undefined when the target does not exist. */
  resolve(target: string): Promise<string | undefined>;
  /** Opens the target, as following a link to it would. */
  open(target: string): void;
  readonly labels: {
    /** The region's name, such as "Embedded note Plan". */
    region(target: string): string;
    /** What shows in place of the content when the target does not exist. */
    notFound(target: string): string;
  };
}

export const embedResolverFacet = Facet.define<EmbedResolver, EmbedResolver | undefined>({
  combine: (resolvers) => resolvers[0],
});

const MAIN_BUTTON = 0;

/**
 * Embedded content, read-only and rendered like the preview, named after its target. Enter or
 * Ctrl+click opens the target; a plain click puts the caret on the embed, which shows its Markdown.
 */
export class EmbedWidget extends RenderedWidget {
  constructor(
    source: string,
    readonly target: string,
  ) {
    super(source, lineCountOf(source));
  }

  override eq(other: WidgetType): boolean {
    return other instanceof EmbedWidget && other.source === this.source && other.target === this.target;
  }

  toDOM(view: EditorView): HTMLElement {
    const region = this.container(view, 'div', EMBED_CLASS);
    const resolver = view.state.facet(embedResolverFacet);
    const rendering = renderingOf(view);
    region.textContent = this.source;
    if (!resolver || !rendering) return region;
    region.setAttribute('role', 'region');
    region.setAttribute('aria-label', resolver.labels.region(this.target));
    region.tabIndex = 0;
    region.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.ctrlKey || event.altKey || event.shiftKey || isComposing(view))
        return;
      event.preventDefault();
      resolver.open(this.target);
    });
    region.addEventListener('click', (event) => {
      if (event.altKey || event.button !== MAIN_BUTTON) return;
      event.preventDefault();
      if (event.ctrlKey) {
        resolver.open(this.target);
        return;
      }
      // The region takes the focus on a click, so the caret is placed here to show the Markdown.
      view.dispatch({ selection: { anchor: view.posAtDOM(region) } });
      view.focus();
    });
    void resolver.resolve(this.target).then(
      (markdown) => this.showContent(region, view, markdown),
      () => this.showContent(region, view, undefined),
    );
    return region;
  }

  /** Keys and clicks are the embed's own: Enter and Ctrl+click open it, a click shows its Markdown. */
  override ignoreEvent(event: Event): boolean {
    return event instanceof KeyboardEvent || (event instanceof MouseEvent && !event.altKey);
  }

  private showContent(region: HTMLElement, view: EditorView, markdown: string | undefined): void {
    const resolver = view.state.facet(embedResolverFacet);
    const rendering = renderingOf(view);
    if (!resolver || !rendering) return;
    const content = view.dom.ownerDocument.createElement('div');
    if (markdown === undefined) {
      content.className = EMBED_NOT_FOUND_CLASS;
      content.textContent = resolver.labels.notFound(this.target);
    } else {
      content.className = EMBED_CONTENT_CLASS;
      content.innerHTML = rendering.renderBlock(markdown);
      settleRenderedHtml(content, view);
    }
    region.replaceChildren(content);
    if (view.dom.isConnected) view.requestMeasure();
  }
}

/** Open Link with the caret on an embed's line opens its target, the keyboard's way to it. */
export function openEmbedAtCaret(view: EditorView): boolean {
  const resolver = view.state.facet(embedResolverFacet);
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const target = resolver?.targetOf(line.text);
  if (!resolver || target === undefined) return false;
  resolver.open(target);
  return true;
}

/** Paragraphs the kind's resolver calls embeds, while the app renders blocks. */
export const EMBED_BLOCKS: RichTextBlockProvider = {
  nodeNames: ['Paragraph'],
  widgetFor: (block) => {
    const resolver = block.state.facet(embedResolverFacet);
    if (!resolver || block.state.facet(richTextRenderingFacet) === undefined) return undefined;
    const target = resolver.targetOf(block.source);
    return target === undefined ? undefined : new EmbedWidget(block.source, target);
  },
};
