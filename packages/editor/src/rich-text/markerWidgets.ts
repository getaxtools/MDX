import { WidgetType, type EditorView } from '@codemirror/view';
import { renderingOf } from './renderedWidgets';
import { BULLET_CLASS, TASK_CHECKBOX_CLASS } from './richTextClasses';

/** The preview's disc, circle and square for the first, second and deeper bullet lists. */
const BULLETS_BY_DEPTH = ['•', '◦', '▪'];

/** A bullet in place of a `-`, `*` or `+` list marker. */
export class BulletWidget extends WidgetType {
  constructor(private readonly depth: number) {
    super();
  }

  override eq(other: BulletWidget): boolean {
    return other.depth === this.depth;
  }

  toDOM(view: EditorView): HTMLElement {
    const bullet = view.dom.ownerDocument.createElement('span');
    bullet.className = BULLET_CLASS;
    bullet.setAttribute('aria-hidden', 'true');
    bullet.textContent = BULLETS_BY_DEPTH[Math.min(this.depth, BULLETS_BY_DEPTH.length) - 1] ?? '';
    return bullet;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

/** A checkbox in place of a task's `[ ]` or `[x]`, named by the item's text and left out of the Tab order. */
export class TaskCheckboxWidget extends WidgetType {
  constructor(
    readonly isChecked: boolean,
    private readonly labelId: string | undefined,
  ) {
    super();
  }

  override eq(other: TaskCheckboxWidget): boolean {
    return other.isChecked === this.isChecked && other.labelId === this.labelId;
  }

  toDOM(view: EditorView): HTMLElement {
    const checkbox = view.dom.ownerDocument.createElement('span');
    checkbox.className = TASK_CHECKBOX_CLASS;
    checkbox.setAttribute('role', 'checkbox');
    checkbox.setAttribute('aria-checked', String(this.isChecked));
    checkbox.setAttribute('tabindex', '-1');
    if (this.labelId !== undefined) checkbox.setAttribute('aria-labelledby', this.labelId);
    else this.nameWithoutText(checkbox, view);
    return checkbox;
  }

  private nameWithoutText(checkbox: HTMLElement, view: EditorView): void {
    const name = renderingOf(view)?.labels.task();
    if (name !== undefined) checkbox.setAttribute('aria-label', name);
  }

  /** The editor handles clicks on it, so a click toggles the task instead of moving the caret. */
  override ignoreEvent(): boolean {
    return false;
  }
}
