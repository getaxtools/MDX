import type { FormulaPreview } from '@mdx/renderer';

export const PREVIEW_DELAY_MS = 50;

export type FormulaProblem = Exclude<FormulaPreview, { readonly kind: 'typeset' }>;

/** What the equation editor shows: the last formula that typeset, and what is wrong with the source now. */
export interface ShownFormulaPreview {
  readonly html: string | undefined;
  readonly problem: FormulaProblem | undefined;
}

export type PreviewFormula = (tex: string, isDisplay: boolean) => Promise<FormulaPreview>;

/**
 * Typesets the source a short while after typing stops, so each key does not typeset again. A
 * failing source keeps the last good result; an empty one clears it.
 */
export class FormulaPreviewer {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private requestNumber = 0;
  private lastHtml: string | undefined;

  constructor(
    private readonly previewFormula: PreviewFormula,
    private readonly onShow: (shown: ShownFormulaPreview) => void,
  ) {}

  /** Typesets once typing has paused. */
  request(tex: string, isDisplay: boolean): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.render(tex, isDisplay), PREVIEW_DELAY_MS);
  }

  /** Typesets straight away, such as when the dialog opens. */
  renderNow(tex: string, isDisplay: boolean): Promise<void> {
    clearTimeout(this.timer);
    return this.render(tex, isDisplay);
  }

  stop(): void {
    clearTimeout(this.timer);
    this.requestNumber += 1;
  }

  private async render(tex: string, isDisplay: boolean): Promise<void> {
    this.requestNumber += 1;
    const number = this.requestNumber;
    if (tex.trim() === '') {
      this.lastHtml = undefined;
      this.onShow({ html: undefined, problem: undefined });
      return;
    }
    const preview = await this.previewFormula(tex, isDisplay);
    if (number !== this.requestNumber) return;
    if (preview.kind === 'typeset') this.lastHtml = preview.html;
    this.onShow({ html: this.lastHtml, problem: preview.kind === 'typeset' ? undefined : preview });
  }
}
