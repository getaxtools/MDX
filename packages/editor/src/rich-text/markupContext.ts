import type { EditorState, Range } from '@codemirror/state';
import { Decoration } from '@codemirror/view';
import { isTouchedBySelection } from './revealRule';

export interface VisibleRange {
  readonly from: number;
  readonly to: number;
}

/** What a decorator needs: the state, the visible range it decorates and the list it adds to. */
export interface MarkupContext {
  readonly state: EditorState;
  readonly visible: VisibleRange;
  readonly decorations: Range<Decoration>[];
  /** Makes the ids of decorated elements unique to one editor. */
  readonly idPrefix: string;
}

const HIDDEN = Decoration.replace({});

export function isRevealed(context: MarkupContext, from: number, to: number): boolean {
  return isTouchedBySelection(context.state.selection, from, to);
}

/** Each decoration is added by the visible range it starts in, so ranges never add it twice. */
function isAddedHere(context: MarkupContext, position: number): boolean {
  return position >= context.visible.from && position <= context.visible.to;
}

/** Hides text line by line, because only block decorations may hide a line break. */
export function hide(context: MarkupContext, from: number, to: number): void {
  const { doc } = context.state;
  for (let start = from; start < to;) {
    const line = doc.lineAt(start);
    const end = Math.min(to, line.to);
    if (end > start && isAddedHere(context, start)) context.decorations.push(HIDDEN.range(start, end));
    start = line.to + 1;
  }
}

/** Adds a mark, or a widget in place of the text; empty ranges are skipped. */
export function decorate(
  context: MarkupContext,
  decoration: Decoration,
  { from, to }: { readonly from: number; readonly to: number },
): void {
  if (to > from && isAddedHere(context, from)) context.decorations.push(decoration.range(from, to));
}

/** Adds a line decoration to every visible line from one position to another. */
export function decorateLines(
  context: MarkupContext,
  decoration: Decoration,
  range: { readonly from: number; readonly to: number },
): void {
  const { doc } = context.state;
  const end = Math.min(range.to, context.visible.to);
  for (let position = Math.max(range.from, context.visible.from); position <= end;) {
    const line = doc.lineAt(position);
    if (isAddedHere(context, line.from)) context.decorations.push(decoration.range(line.from));
    position = line.to + 1;
  }
}
