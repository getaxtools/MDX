import type { syntaxTree } from '@codemirror/language';
import { Decoration } from '@codemirror/view';
import { decorate, decorateLines, hide, isRevealed, type MarkupContext } from './markupContext';
import { BulletWidget, TaskCheckboxWidget } from './markerWidgets';
import {
  CODE_LINE_CLASS,
  DEEPEST_QUOTE_STYLE,
  LIST_NUMBER_CLASS,
  QUOTE_CLASS,
  quoteDepthClassOf,
} from './richTextClasses';

type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>['resolveInner']>;

const BULLET_STYLES = 3;
const BULLETS = Array.from({ length: BULLET_STYLES }, (_, index) =>
  Decoration.replace({ widget: new BulletWidget(index + 1) }),
);
const QUOTE_LINES = Array.from({ length: DEEPEST_QUOTE_STYLE }, (_, index) =>
  Decoration.line({ class: `${QUOTE_CLASS} ${quoteDepthClassOf(index + 1)}` }),
);
const LIST_NUMBER = Decoration.mark({ class: LIST_NUMBER_CLASS });
const CODE_LINE = Decoration.line({ class: CODE_LINE_CLASS });
const LIST_NAMES: ReadonlySet<string> = new Set(['BulletList', 'OrderedList']);
const QUOTE_NAMES: ReadonlySet<string> = new Set(['Blockquote']);
/** The `>` of a quote line and those of the quotes inside it, each with the space after it. */
const QUOTE_MARKER_RUN = /^>[ \t]?(?:[ \t]{0,3}>[ \t]?)*/;
const LEADING_SPACE = /^[ \t]*/;

function depthAmong(node: SyntaxNode, names: ReadonlySet<string>): number {
  let depth = 0;
  for (let ancestor: SyntaxNode | null = node; ancestor; ancestor = ancestor.parent) {
    if (names.has(ancestor.name)) depth += 1;
  }
  return depth;
}

/** Code keeps the preview's code font in Rich text; its fences show as written. */
export function decorateCodeLines(node: SyntaxNode, context: MarkupContext): void {
  decorateLines(context, CODE_LINE, node);
}

/** Every line of a quote gets the quote bar, indented by how deep the quote is. */
export function decorateQuote(node: SyntaxNode, context: MarkupContext): void {
  const depth = Math.min(depthAmong(node, QUOTE_NAMES), DEEPEST_QUOTE_STYLE);
  const line = QUOTE_LINES[depth - 1];
  if (line) decorateLines(context, line, node);
}

/** The first `>` of a line hides the whole run of markers, so a nested quote's line reveals at once. */
export function decorateQuoteMark(node: SyntaxNode, context: MarkupContext): void {
  const { state } = context;
  const line = state.doc.lineAt(node.from);
  if (state.sliceDoc(line.from, node.from).trimEnd().endsWith('>')) return;
  const run = QUOTE_MARKER_RUN.exec(state.sliceDoc(node.from, line.to))?.[0] ?? '>';
  const end = node.from + run.length;
  if (!isRevealed(context, node.from, end)) hide(context, node.from, end);
}

/** Task markers show as checkboxes, like the preview's task items without bullets or numbers. */
export function decorateListMark(node: SyntaxNode, context: MarkupContext): void {
  const list = node.parent?.parent;
  if (!list) return;
  const task = node.nextSibling;
  if (task?.name === 'Task') {
    decorateTaskItem(node, task, context);
    return;
  }
  if (list.name === 'OrderedList') {
    decorate(context, LIST_NUMBER, node);
    return;
  }
  const bullet = BULLETS[Math.min(depthAmong(list, LIST_NAMES), BULLET_STYLES) - 1];
  if (bullet && !isRevealed(context, node.from, node.to)) decorate(context, bullet, node);
}

/** `- [ ] Pay rent` shows a checkbox named by its text, and its Markdown once a selection touches it. */
function decorateTaskItem(listMark: SyntaxNode, task: SyntaxNode, context: MarkupContext): void {
  const marker = task.getChild('TaskMarker');
  if (!marker) return;
  const labelId = labelTaskText(context, marker, task);
  if (isRevealed(context, listMark.from, marker.to)) return;
  hide(context, listMark.from, marker.from);
  const isChecked = context.state.sliceDoc(marker.from + 1, marker.to - 1) !== ' ';
  const checkbox = Decoration.replace({ widget: new TaskCheckboxWidget(isChecked, labelId) });
  decorate(context, checkbox, marker);
}

/** The task's text on its first line gets an id, so its checkbox can be named by it. */
function labelTaskText(context: MarkupContext, marker: SyntaxNode, task: SyntaxNode): string | undefined {
  const line = context.state.doc.lineAt(marker.to);
  const space = LEADING_SPACE.exec(context.state.sliceDoc(marker.to, line.to))?.[0].length ?? 0;
  const start = marker.to + space;
  const end = Math.min(line.to, task.to);
  if (end <= start) return undefined;
  const id = `${context.idPrefix}-task-${String(marker.from)}`;
  decorate(context, Decoration.mark({ attributes: { id } }), { from: start, to: end });
  return id;
}
