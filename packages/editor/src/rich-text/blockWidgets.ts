import { WidgetType, type EditorView } from '@codemirror/view';
import {
  lineCountOf,
  RenderedWidget,
  renderingOf,
  settleRenderedHtml,
  showRenderedHtml,
  showRenderedHtmlWhenReady,
} from './renderedWidgets';
import {
  DIAGRAM_CLASS,
  FORMULA_CLASS,
  HTML_BLOCK_CLASS,
  IMAGE_CLASS,
  PROPERTIES_CLASS,
  RULE_CLASS,
  TABLE_CLASS,
} from './richTextClasses';

/** A formula typeset like the preview's, named "Formula" and its source; its source shows until then. */
export class FormulaWidget extends RenderedWidget {
  constructor(
    source: string,
    private readonly tex: string,
    private readonly isDisplay: boolean,
  ) {
    super(source, lineCountOf(source));
  }

  toDOM(view: EditorView): HTMLElement {
    const formula = this.container(view, this.isDisplay ? 'div' : 'span', FORMULA_CLASS);
    formula.textContent = this.source;
    const rendering = renderingOf(view);
    if (!rendering) return formula;
    formula.setAttribute('role', 'img');
    formula.setAttribute('aria-label', rendering.labels.formula(this.tex));
    showRenderedHtmlWhenReady(formula, view, {
      cacheKey: `formula:${String(this.isDisplay)}:${this.tex}`,
      render: () => rendering.typesetMath(this.tex, this.isDisplay),
    });
    return formula;
  }
}

/** A table rendered by the preview's renderer, named by its rows and columns. */
export class TableWidget extends RenderedWidget {
  constructor(
    source: string,
    private readonly size: { readonly rows: number; readonly columns: number },
  ) {
    super(source, lineCountOf(source));
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = this.container(view, 'div', TABLE_CLASS);
    const rendering = renderingOf(view);
    if (!rendering) return wrapper;
    showRenderedHtml(wrapper, `table:${rendering.documentKey}:${this.source}`, () =>
      rendering.renderBlock(this.source),
    );
    wrapper
      .querySelector('table')
      ?.setAttribute('aria-label', rendering.labels.table(this.size.rows, this.size.columns));
    settleRenderedHtml(wrapper, view);
    return wrapper;
  }
}

/** A line above a block that stays Markdown text, saying why, such as a table too large for a grid. */
export class TextNoticeWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }

  override eq(other: WidgetType): boolean {
    return other instanceof TextNoticeWidget && other.text === this.text;
  }

  toDOM(view: EditorView): HTMLElement {
    const notice = view.dom.ownerDocument.createElement('div');
    notice.className = 'cm-text-notice';
    notice.textContent = this.text;
    return notice;
  }
}

/** An HTML block as the preview shows it, after the preview's sanitizer. */
export class HtmlBlockWidget extends RenderedWidget {
  toDOM(view: EditorView): HTMLElement {
    const wrapper = this.container(view, 'div', HTML_BLOCK_CLASS);
    const rendering = renderingOf(view);
    if (!rendering) return wrapper;
    showRenderedHtml(wrapper, `html:${rendering.documentKey}:${this.source}`, () =>
      rendering.renderBlock(this.source),
    );
    settleRenderedHtml(wrapper, view);
    return wrapper;
  }
}

/** A diagram drawn by the app's diagram port, named by its type. */
export class DiagramWidget extends RenderedWidget {
  constructor(
    source: string,
    private readonly diagram: { readonly type: string; readonly code: string },
  ) {
    super(source, lineCountOf(source));
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = this.container(view, 'div', DIAGRAM_CLASS);
    wrapper.textContent = this.source;
    const rendering = renderingOf(view);
    const draw = rendering?.drawDiagram;
    if (!rendering || !draw) return wrapper;
    wrapper.setAttribute('role', 'img');
    wrapper.setAttribute('aria-label', rendering.labels.diagram(this.diagram.type));
    showRenderedHtmlWhenReady(wrapper, view, {
      cacheKey: `diagram:${this.diagram.type}:${this.diagram.code}`,
      render: () => draw(this.diagram.type, this.diagram.code),
    });
    return wrapper;
  }
}

/** A picture as the preview shows it; a picture that fails to load shows its address instead. */
export class ImageWidget extends RenderedWidget {
  constructor(
    source: string,
    private readonly address: string,
  ) {
    super(source, 1);
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = this.container(view, 'span', IMAGE_CLASS);
    const rendering = renderingOf(view);
    if (!rendering) return wrapper;
    showRenderedHtml(wrapper, `image:${rendering.documentKey}:${this.source}`, () =>
      rendering.renderBlock(this.source),
    );
    unwrapParagraphs(wrapper);
    for (const picture of wrapper.querySelectorAll('img')) {
      picture.addEventListener('error', () => picture.replaceWith(this.address), { once: true });
    }
    settleRenderedHtml(wrapper, view);
    return wrapper;
  }
}

/** The renderer wraps a lone picture in a paragraph, which has no place inside a line. */
function unwrapParagraphs(wrapper: HTMLElement): void {
  for (const paragraph of wrapper.querySelectorAll('p')) paragraph.replaceWith(...paragraph.childNodes);
}

/** A horizontal rule in place of `---`. */
export class RuleWidget extends WidgetType {
  override eq(other: WidgetType): boolean {
    return other instanceof RuleWidget;
  }

  toDOM(view: EditorView): HTMLElement {
    const rule = view.dom.ownerDocument.createElement('span');
    rule.className = RULE_CLASS;
    rule.setAttribute('role', 'separator');
    return rule;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

/** Front matter collapsed to a chip that says how many properties it holds. */
export class PropertiesChipWidget extends RenderedWidget {
  constructor(
    source: string,
    private readonly propertyCount: number,
  ) {
    super(source, 1);
  }

  override eq(other: WidgetType): boolean {
    return (
      super.eq(other) && other instanceof PropertiesChipWidget && other.propertyCount === this.propertyCount
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const chip = this.container(view, 'div', PROPERTIES_CLASS);
    chip.textContent = renderingOf(view)?.labels.properties(this.propertyCount) ?? this.source;
    return chip;
  }
}
