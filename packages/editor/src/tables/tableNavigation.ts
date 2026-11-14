import { EditorSelection, type EditorState, type StateCommand } from '@codemirror/state';
import { tableAt, type MarkdownTable, type TableCell } from './tableCells';

/** Tab selects the next cell, and in the last cell adds a row; outside a table it does nothing here. */
export const selectNextCell: StateCommand = ({ state, dispatch }) => {
  const table = tableAt(state, state.selection.main.head);
  if (!table) return false;
  const index = currentCellIndex(table, state);
  const next = table.cells[index + 1];
  if (next) {
    dispatch(state.update({ selection: selectionOf(next), scrollIntoView: true, userEvent: 'select' }));
    return true;
  }
  dispatch(state.update(addRowAfter(table), { scrollIntoView: true, userEvent: 'input' }));
  return true;
};

/** Shift+Tab selects the previous cell, skipping the delimiter row; in the first cell it stays there. */
export const selectPreviousCell: StateCommand = ({ state, dispatch }) => {
  const table = tableAt(state, state.selection.main.head);
  if (!table) return false;
  const previous = table.cells[currentCellIndex(table, state) - 1];
  if (previous)
    dispatch(state.update({ selection: selectionOf(previous), scrollIntoView: true, userEvent: 'select' }));
  return true;
};

/** The cell holding the caret, or the last cell that starts before it, such as from a pipe. */
function currentCellIndex(table: MarkdownTable, state: EditorState): number {
  const { head } = state.selection.main;
  const containing = table.cells.findIndex((cell) => cell.from <= head && head <= cell.to);
  if (containing !== -1) return containing;
  return table.cells.reduce((found, cell, index) => (cell.from <= head ? index : found), -1);
}

function selectionOf(cell: TableCell): EditorSelection {
  return EditorSelection.single(cell.from, cell.to);
}

function addRowAfter(table: MarkdownTable): {
  changes: { from: number; insert: string };
  selection: EditorSelection;
} {
  const row = `|${'  |'.repeat(Math.max(table.columnCount, 1))}`;
  const insert = `\n${row}`;
  const firstCell = table.to + 1 + '| '.length;
  return { changes: { from: table.to, insert }, selection: EditorSelection.single(firstCell) };
}
