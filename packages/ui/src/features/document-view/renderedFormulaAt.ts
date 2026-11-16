import { MATH_DISPLAY_CLASS, MATH_INLINE_CLASS } from '@mdx/renderer';

/** A formula in the preview: its place among the document's formulas, and its source. */
export interface RenderedFormula {
  readonly index: number;
  readonly source: string;
}

const FORMULA_SELECTOR = `.${MATH_INLINE_CLASS}, .${MATH_DISPLAY_CLASS}`;

/** The rendered formula an event happened on, such as the one a context menu was opened on. */
export function renderedFormulaAt(
  target: EventTarget | null,
  article: HTMLElement | undefined,
): RenderedFormula | undefined {
  const formula = target instanceof Element ? target.closest(FORMULA_SELECTOR) : null;
  if (!formula || !article?.contains(formula)) return undefined;
  const index = [...article.querySelectorAll(FORMULA_SELECTOR)].indexOf(formula);
  // A typeset formula keeps its source in its name; one not typeset yet still shows it as text.
  const source = formula.getAttribute('aria-label') ?? formula.textContent;
  return { index, source };
}
