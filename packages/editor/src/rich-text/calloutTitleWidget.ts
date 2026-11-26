import { Facet } from '@codemirror/state';
import { WidgetType, type EditorView } from '@codemirror/view';
import { toggleCalloutFold, type CalloutFoldRange } from './calloutFolds';
import { CALLOUT_TYPE_PHRASE } from '../plain/calloutPhrases';
import { CALLOUT_TITLE_CLASS } from './richTextClasses';

export { CALLOUT_TYPE_PHRASE } from '../plain/calloutPhrases';

/** Where a callout's type word is, which the type menu replaces. */
export interface CalloutTypeRange {
  readonly from: number;
  readonly to: number;
}

/** Opens the callout type menu at a point on screen, for the callout whose type word is given. */
export const calloutTypeMenuOpener = Facet.define<
  (point: { readonly x: number; readonly y: number }, type: CalloutTypeRange) => void,
  ((point: { readonly x: number; readonly y: number }, type: CalloutTypeRange) => void) | undefined
>({ combine: (openers) => openers[0] });

export interface CalloutTitle {
  readonly title: string;
  readonly typeRange: CalloutTypeRange;
  /** For a callout written with `-` or `+`: the lines it folds and whether they are folded now. */
  readonly fold: { readonly range: CalloutFoldRange; readonly isCollapsed: boolean } | undefined;
}

const TYPE_BUTTON_CLASS = 'cm-rich-callout-type';
const FOLD_BUTTON_CLASS = 'cm-rich-callout-fold';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const INFO_ICON = 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 11v6M12 7.5h.01';
const CHEVRON = 'M9 6l6 6-6 6';

function iconOf(view: EditorView, path: string): SVGElement {
  const svg = view.dom.ownerDocument.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const shape = view.dom.ownerDocument.createElementNS(SVG_NAMESPACE, 'path');
  shape.setAttribute('d', path);
  svg.append(shape);
  return svg;
}

/** Buttons in the title keep the editor's focus and caret where they were when pressed. */
function controlButton(view: EditorView, className: string): HTMLButtonElement {
  const button = view.dom.ownerDocument.createElement('button');
  button.type = 'button';
  button.className = className;
  button.tabIndex = -1;
  button.addEventListener('mousedown', (event) => event.preventDefault());
  return button;
}

/** A callout's title in place of its `[!type]` marker, with its type button and, if it folds, a fold button. */
export class CalloutTitleWidget extends WidgetType {
  constructor(private readonly callout: CalloutTitle) {
    super();
  }

  override eq(other: WidgetType): boolean {
    return other instanceof CalloutTitleWidget && other.key === this.key;
  }

  /** What the drawn title depends on; a title with the same key is not drawn again. */
  private get key(): string {
    const { title, typeRange, fold } = this.callout;
    return JSON.stringify([
      title,
      typeRange.from,
      typeRange.to,
      fold?.isCollapsed,
      fold?.range.from,
      fold?.range.to,
    ]);
  }

  toDOM(view: EditorView): HTMLElement {
    const title = view.dom.ownerDocument.createElement('span');
    title.className = CALLOUT_TITLE_CLASS;
    const typeMenu = view.state.facet(calloutTypeMenuOpener);
    if (typeMenu) title.append(this.typeButton(view, typeMenu));
    title.append(this.callout.fold ? this.foldButton(view, this.callout.fold) : this.callout.title);
    return title;
  }

  private typeButton(
    view: EditorView,
    open: (point: { readonly x: number; readonly y: number }, type: CalloutTypeRange) => void,
  ): HTMLButtonElement {
    const button = controlButton(view, TYPE_BUTTON_CLASS);
    button.setAttribute('aria-label', view.state.phrase(CALLOUT_TYPE_PHRASE));
    button.setAttribute('aria-haspopup', 'menu');
    button.append(iconOf(view, INFO_ICON));
    button.addEventListener('click', () => {
      const bounds = button.getBoundingClientRect();
      open({ x: bounds.left, y: bounds.bottom }, this.callout.typeRange);
    });
    return button;
  }

  /** The title itself is the fold button, so its name is the title and it reports whether it is expanded. */
  private foldButton(view: EditorView, fold: NonNullable<CalloutTitle['fold']>): HTMLButtonElement {
    const button = controlButton(view, FOLD_BUTTON_CLASS);
    button.setAttribute('aria-expanded', String(!fold.isCollapsed));
    button.append(iconOf(view, CHEVRON), this.callout.title);
    button.addEventListener('click', () => toggleCalloutFold(view, fold.range));
    return button;
  }

  /** The editor leaves presses and keys on the title's buttons to them. */
  override ignoreEvent(event: Event): boolean {
    return event.target instanceof Element && event.target.closest('button') !== null;
  }
}
