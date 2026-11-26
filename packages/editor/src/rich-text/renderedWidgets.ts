import { WidgetType, type EditorView } from '@codemirror/view';
import { linkOpener } from './linkOpening';
import { SHARED_RENDER_CACHE } from './renderCache';
import { RENDERED_BLOCK_CLASS } from './richTextClasses';
import { richTextRenderingFacet, type RichTextRendering } from './richTextRendering';

const LINE_HEIGHT_ESTIMATE_PX = 24;
/** Elements of rendered HTML that would otherwise take a Tab stop of their own. */
const FOCUSABLE =
  'a[href], area[href], summary, input, select, textarea, button, [tabindex], [contenteditable]';
/** Clicks here belong to the rendered block, such as opening a details block, not to the editor. */
const OWN_CONTROLS = 'summary, a[href]';

export function lineCountOf(source: string): number {
  return source.split('\n').length;
}

export function renderingOf(view: EditorView): RichTextRendering | undefined {
  return view.state.facet(richTextRenderingFacet);
}

/** Rendered HTML is shown, never edited or tabbed into; its links open only through the app. */
export function settleRenderedHtml(container: HTMLElement, view: EditorView): void {
  for (const element of container.querySelectorAll(FOCUSABLE)) element.setAttribute('tabindex', '-1');
  container.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link) return;
    // The webview must never navigate away from the app.
    event.preventDefault();
    const href = link.getAttribute('href');
    // Already the preview's href; the angle brackets keep it one destination when it is read again.
    if (event.ctrlKey && href !== null)
      view.state.facet(linkOpener)?.({ destination: `<${href}>`, form: 'destination' });
  });
}

/** A block whose source is shown rendered: redrawn only when its source changes. */
export abstract class RenderedWidget extends WidgetType {
  constructor(
    readonly source: string,
    private readonly lineCount: number,
  ) {
    super();
  }

  override eq(other: WidgetType): boolean {
    return (
      other instanceof RenderedWidget &&
      other.constructor === this.constructor &&
      other.source === this.source
    );
  }

  override get estimatedHeight(): number {
    return this.lineCount * LINE_HEIGHT_ESTIMATE_PX;
  }

  override ignoreEvent(event: Event): boolean {
    return event.target instanceof Element && event.target.closest(OWN_CONTROLS) !== null;
  }

  protected container(view: EditorView, tagName: 'div' | 'span', kindClass: string): HTMLElement {
    const element = view.dom.ownerDocument.createElement(tagName);
    element.className = `${RENDERED_BLOCK_CLASS} ${kindClass}`;
    return element;
  }
}

/** The key a render is shared under, or undefined for a document whose renders stay its own. */
export function sharedCacheKey(rendering: RichTextRendering, key: string): string | undefined {
  return rendering.keepsRendersPrivate === true ? undefined : key;
}

/** Fills an element with HTML the app rendered, from the shared cache when the same source was rendered before. */
export function showRenderedHtml(
  element: HTMLElement,
  cacheKey: string | undefined,
  render: () => string,
): void {
  let html = cacheKey === undefined ? undefined : SHARED_RENDER_CACHE.get(cacheKey);
  if (html === undefined) {
    html = render();
    if (cacheKey !== undefined) SHARED_RENDER_CACHE.set(cacheKey, html);
  }
  element.innerHTML = html;
}

/** Fills an element once an asynchronous render is ready; until then, and when it fails, the source shows. */
export function showRenderedHtmlWhenReady(
  element: HTMLElement,
  view: EditorView,
  {
    cacheKey,
    render,
  }: { readonly cacheKey: string | undefined; readonly render: () => Promise<string | undefined> },
): void {
  const cached = cacheKey === undefined ? undefined : SHARED_RENDER_CACHE.get(cacheKey);
  if (cached !== undefined) {
    element.innerHTML = cached;
    return;
  }
  void render().then((html) => {
    if (html === undefined) return;
    if (cacheKey !== undefined) SHARED_RENDER_CACHE.set(cacheKey, html);
    element.innerHTML = html;
    if (view.dom.isConnected) view.requestMeasure();
  });
}
