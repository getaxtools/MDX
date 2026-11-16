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

function taskMarkersOnSelectedLines(state: EditorState): number[] {
  const lineStarts = new Set(state.selection.ranges.map((range) => state.doc.lineAt(range.head).from));
  const markers: number[] = [];
  const tree = syntaxTree(state);
  for (const lineStart of lineStarts) {
    const line = state.doc.lineAt(lineStart);
    tree.iterate({
      from: line.from,
      to: line.to,
      enter: (node) => {
        if (node.name === 'TaskMarker' && node.from >= line.from) markers.push(node.from);
      },
    });
  }
  return markers;
}

/** A click on a task's checkbox toggles it and leaves the caret where it was. */
export function toggleClickedTask(event: MouseEvent, view: EditorView): boolean {
  if (event.button !== MAIN_BUTTON || isComposing(view) || !(event.target instanceof Element)) return false;
  const checkbox = event.target.closest(`.${TASK_CHECKBOX_CLASS}`);
  if (!checkbox || !view.contentDOM.contains(checkbox)) return false;
  const spec = taskToggle(view.state, view.posAtDOM(checkbox));
  if (!spec) return false;
  view.dispatch(spec);
  return true;
}
