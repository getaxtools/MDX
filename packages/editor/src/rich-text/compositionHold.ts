import { StateEffect } from '@codemirror/state';
import type { DecorationSet, EditorView, ViewUpdate } from '@codemirror/view';

/** True from the start of an input method composition to its end, even before it has changed any text. */
export function isComposing(view: EditorView): boolean {
  return view.composing || view.compositionStarted;
}

/** Applies what the Rich text layers held back during a composition that ended without changing the text. */
export const applyHeldBackMarkup = StateEffect.define();

/**
 * Decorations that stand still while an input method composes: they only follow the text, and the
 * rebuild that became due runs once, after the composition has ended.
 */
export class DecorationsHeldDuringComposition {
  private currentDecorations: DecorationSet;
  private isRebuildDue = false;
  private pendingApply: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly view: EditorView,
    private readonly build: (view: EditorView) => DecorationSet,
  ) {
    this.currentDecorations = build(view);
  }

  get decorations(): DecorationSet {
    return this.currentDecorations;
  }

  update(update: ViewUpdate, isRebuildNeeded: boolean): void {
    if (isComposing(update.view)) {
      this.currentDecorations = this.currentDecorations.map(update.changes);
      this.isRebuildDue ||= isRebuildNeeded;
      return;
    }
    if (!isRebuildNeeded && !this.isRebuildDue) return;
    this.isRebuildDue = false;
    this.currentDecorations = this.build(update.view);
  }

  /** CodeMirror sends no update when a composition ends without a change, so this asks for one. */
  compositionEnded(): void {
    if (!this.isRebuildDue) return;
    clearTimeout(this.pendingApply);
    // A task, so the input method's last changes have been read from the page before the update.
    this.pendingApply = setTimeout(() => {
      this.pendingApply = undefined;
      if (this.isRebuildDue && !isComposing(this.view)) {
        this.view.dispatch({ effects: applyHeldBackMarkup.of(null) });
      }
    }, 0);
  }

  destroy(): void {
    clearTimeout(this.pendingApply);
  }
}
