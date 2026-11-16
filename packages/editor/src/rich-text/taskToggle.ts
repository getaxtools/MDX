import { isolateHistory } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';
import type { EditorState, TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { isComposing } from './compositionHold';
import { TASK_CHECKBOX_CLASS } from './richTextClasses';

const MAIN_BUTTON = 0;

/** Ticks or clears the task whose `[ ]` starts at a position, as an undo step of its own. */
export function taskToggle(state: EditorState, markerFrom: number): TransactionSpec | undefined {
  return taskTogglesAt(state, [markerFrom]);
}

function taskTogglesAt(state: EditorState, markerStarts: readonly number[]): TransactionSpec | undefined {
  const changes = markerStarts
    .filter((from) => /^\[[ xX]\]$/.test(state.sliceDoc(from, from + '[ ]'.length)))
    .map((from) => ({
      from: from + 1,
      to: from + 2,
      insert: state.sliceDoc(from + 1, from + 2) === ' ' ? 'x' : ' ',
    }));
  if (changes.length === 0) return undefined;
  return { changes, userEvent: 'input', annotations: isolateHistory.of('full') };
}

/** Ctrl+Enter on task lines toggles them; on other lines it leaves the key to the next command. */
export function toggleTasksAtCaret(view: EditorView): boolean {
  if (isComposing(view)) return false;
  const spec = taskTogglesAt(view.state, taskMarkersOnSelectedLines(view.state));
  if (!spec) return false;
  view.dispatch(spec);
  return true;
}

/** Every task marker on a line a selection range covers, each line once. */
function taskMarkersOnSelectedLines(state: EditorState): number[] {
  const markers = new Set<number>();
  const tree = syntaxTree(state);
  for (const range of state.selection.ranges) {
    const from = state.doc.lineAt(range.from).from;
    const to = state.doc.lineAt(range.to).to;
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (node.name === 'TaskMarker' && node.from >= from) markers.add(node.from);
      },
    });
  }
  return [...markers].sort((first, second) => first - second);
}

function clickedCheckbox(event: MouseEvent, view: EditorView): Element | undefined {
  if (event.button !== MAIN_BUTTON || !(event.target instanceof Element)) return undefined;
  const checkbox = event.target.closest(`.${TASK_CHECKBOX_CLASS}`);
  return checkbox && view.contentDOM.contains(checkbox) ? checkbox : undefined;
}

/** Pressing on a checkbox leaves the caret where it was; the click that follows toggles the task. */
export function keepCaretOnCheckbox(event: MouseEvent, view: EditorView): boolean {
  return clickedCheckbox(event, view) !== undefined;
}

/**
 * A click on a task's checkbox toggles it. Assistive technology activates the checkbox with a click
 * alone, so the toggle happens on the click rather than on the press.
 */
export function toggleClickedTask(event: MouseEvent, view: EditorView): boolean {
  const checkbox = clickedCheckbox(event, view);
  if (!checkbox || isComposing(view)) return false;
  const spec = taskToggle(view.state, view.posAtDOM(checkbox));
  if (!spec) return false;
  view.dispatch(spec);
  return true;
}
