import { EditorSelection, type EditorState, type Transaction, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { hasOverlongLine, MAX_RENDERED_TABLE_CELLS } from '../../rich-text/renderLimits';
import { richTextRenderingFacet } from '../../rich-text/richTextRendering';
import { tableAt, type MarkdownTable, type TableCell } from '../tableCells';
import { cellAt, cellOf, gridEdit, missingCellsAdded } from './cellEdits';
import { TABLE_CLASS } from '../../rich-text/richTextClasses';
import { GRID_CELL_CLASS } from './gridWidgets';
import { isTableShownAsText } from './tablesAsText';

/** Whether Rich text shows a table as a grid: it can render it, it is not too large and not shown as text. */
export function isShownAsGrid(state: EditorState, table: MarkdownTable): boolean {
  const cellCount = table.cells.length + table.rows.reduce((sum, row) => sum + row.missingCells, 0);
  return (
    state.facet(richTextRenderingFacet) !== undefined &&
    cellCount <= MAX_RENDERED_TABLE_CELLS &&
    !hasOverlongLine(state.sliceDoc(table.from, table.to)) &&
    !isTableShownAsText(state, table.from)
  );
}

/** The table shown as a grid at a position, if any. */
export function gridTableAt(state: EditorState, position: number): MarkdownTable | undefined {
  const table = tableAt(state, position);
  return table && isShownAsGrid(state, table) ? table : undefined;
}

function moved(view: EditorView, position: number): boolean {
  view.dispatch({ selection: EditorSelection.cursor(position), scrollIntoView: true, userEvent: 'select' });
  return true;
}

/** The empty caret in a grid cell, with its table and cell. */
function caretCell(state: EditorState): { table: MarkdownTable; cell: TableCell; head: number } | undefined {
  const { main } = state.selection;
  if (!main.empty) return undefined;
  const table = gridTableAt(state, main.head);
  const cell = table && cellAt(table, main.head);
  return table && cell ? { table, cell, head: main.head } : undefined;
}

/** Where the caret goes when it leaves the table downwards: the start of the line after it. */
function lineAfter(state: EditorState, table: MarkdownTable): number | undefined {
  return table.to < state.doc.length ? table.to + 1 : undefined;
}

function lineBefore(table: MarkdownTable): number | undefined {
  return table.from > 0 ? table.from - 1 : undefined;
}

/** Right at the end of a cell's text goes to the start of the next cell, and past the last cell out of the table. */
export function moveToNextCell(view: EditorView): boolean {
  const at = caretCell(view.state);
  if (!at || at.head !== at.cell.to) return false;
  const next = at.table.cells[at.table.cells.indexOf(at.cell) + 1];
  const target = next ? next.from : lineAfter(view.state, at.table);
  return target === undefined ? false : moved(view, target);
}

/** Left at the start of a cell's text goes to the end of the previous cell, and before the first cell out of the table. */
export function moveToPreviousCell(view: EditorView): boolean {
  const at = caretCell(view.state);
  if (!at || at.head !== at.cell.from) return false;
  const previous = at.table.cells[at.table.cells.indexOf(at.cell) - 1];
  const target = previous ? previous.to : lineBefore(at.table);
  return target === undefined ? false : moved(view, target);
}

/** The cell in a row at a column, or the row's last cell where the row is short. */
function cellInRow(table: MarkdownTable, row: number, column: number): TableCell | undefined {
  return (
    cellOf(table, row, column) ??
    table.cells.filter((cell) => cell.row === row).reduce<TableCell | undefined>((_, cell) => cell, undefined)
  );
}

function moveToRow(view: EditorView, step: 1 | -1): boolean {
  const at = caretCell(view.state);
  if (!at) return false;
  const target = cellInRow(at.table, at.cell.row + step, at.cell.column);
  const outside = step === 1 ? lineAfter(view.state, at.table) : lineBefore(at.table);
  const position = target ? target.from : outside;
  return position === undefined ? false : moved(view, position);
}

export const moveToCellBelow = (view: EditorView): boolean => moveToRow(view, 1);
export const moveToCellAbove = (view: EditorView): boolean => moveToRow(view, -1);

/** Escape leaves the grid: the caret goes to the line after the table, which is added at the end of the document. */
export function leaveGrid(view: EditorView): boolean {
  const { head } = view.state.selection.main;
  const table = gridTableAt(view.state, head);
  if (!table) return false;
  const after = lineAfter(view.state, table);
  if (after !== undefined) return moved(view, after);
  view.dispatch({
    changes: { from: table.to, insert: '\n' },
    selection: EditorSelection.cursor(table.to + 1),
    scrollIntoView: true,
    userEvent: 'input',
  });
  return true;
}

/**
 * A caret that lands on a grid's pipes, padding or hidden delimiter row, as with Home or a click
 * between cells, moves to the nearest cell edge, so it is always in a cell.
 */
export function caretKeptInCells(transaction: Transaction): TransactionSpec | readonly TransactionSpec[] {
  if (!transaction.selection || transaction.docChanged) return transaction;
  const { state } = transaction;
  const { main } = state.selection;
  if (!main.empty) return transaction;
  const table = gridTableAt(state, main.head);
  if (!table || cellAt(table, main.head)) return transaction;
  const nearest = table.cells.reduce<{ position: number; distance: number } | undefined>((best, cell) => {
    const position = main.head < cell.from ? cell.from : cell.to;
    const distance = Math.abs(position - main.head);
    return !best || distance < best.distance ? { position, distance } : best;
  }, undefined);
  return nearest
    ? [transaction, { selection: EditorSelection.cursor(nearest.position), sequential: true }]
    : transaction;
}

interface PressedCell {
  readonly element: HTMLElement;
  readonly row: number;
  readonly column: number;
}

/** A grid cell, or a cell of the table rendered while the caret was outside it, with its place in the table. */
function pressedCellOf(target: EventTarget | null): PressedCell | undefined {
  if (!(target instanceof Element)) return undefined;
  const gridCell = target.closest(`.${GRID_CELL_CLASS}`);
  if (gridCell instanceof HTMLElement) {
    return {
      element: gridCell,
      row: Number(gridCell.dataset.tableRow),
      column: Number(gridCell.dataset.tableColumn),
    };
  }
  const renderedCell = target.closest(`.${TABLE_CLASS} th, .${TABLE_CLASS} td`);
  const renderedRow = renderedCell?.parentElement;
  const rows = renderedCell?.closest('table')?.rows;
  if (
    !(renderedCell instanceof HTMLTableCellElement) ||
    !(renderedRow instanceof HTMLTableRowElement) ||
    !rows
  ) {
    return undefined;
  }
  return { element: renderedCell, row: [...rows].indexOf(renderedRow), column: renderedCell.cellIndex };
}

/** A press on a cell, rendered or in the grid, puts the caret at the end of its text; a missing cell is added to its row first. */
export function enterPressedCell(event: MouseEvent, view: EditorView): boolean {
  const pressed = event.button === 0 ? pressedCellOf(event.target) : undefined;
  if (!pressed) return false;
  const table = gridTableAt(view.state, view.posAtDOM(pressed.element));
  if (!table) return false;
  event.preventDefault();
  view.focus();
  const cell = cellOf(table, pressed.row, pressed.column);
  if (cell) return moved(view, cell.to);
  const tableRow = table.rows[pressed.row];
  const added = tableRow && missingCellsAdded(view.state, tableRow);
  if (!added) return false;
  view.dispatch({
    changes: added.changes,
    selection: EditorSelection.cursor(added.firstAddedCell),
    annotations: gridEdit.of(true),
    userEvent: 'input',
  });
  return true;
}
