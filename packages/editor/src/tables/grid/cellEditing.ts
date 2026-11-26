import { parseSpreadsheetCells } from '@mdx/core';
import { EditorSelection, Transaction, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { isComposing } from '../../rich-text/compositionHold';
import type { MarkdownTable } from '../tableCells';
import {
  cellAt,
  escapedCellText,
  gridEdit,
  isChangeKeptInCells,
  isEscapingNeeded,
  pastedCellsFill,
} from './cellEdits';
import { gridTableAt } from './gridNavigation';

type ChangeArguments = Parameters<Parameters<Transaction['changes']['iterChanges']>[0]>;

function isUserEdit(transaction: Transaction): boolean {
  return (
    (transaction.isUserEvent('input') || transaction.isUserEvent('delete')) &&
    !transaction.isUserEvent('input.type.compose') &&
    transaction.annotation(gridEdit) !== true
  );
}

/** Text added right before or after the table, such as a new last row, is not inside a cell but keeps the rows. */
function isAtTableEdge(table: MarkdownTable, from: number, to: number): boolean {
  return from === to && (from === table.from || from === table.to);
}

function isInTable(table: MarkdownTable, from: number, to: number): boolean {
  return from >= table.from && to <= table.to;
}

/**
 * Typing, deleting and pasting in a grid stay inside one cell: an edit reaching over a pipe is
 * refused, and a pipe or line break added to a cell is escaped. Composition is left alone until it
 * ends, as its text is still changing.
 */
export function cellLocalEdits(transaction: Transaction): TransactionSpec | readonly TransactionSpec[] {
  if (!transaction.docChanged || !isUserEdit(transaction)) return transaction;
  const start = transaction.startState;
  const table = gridTableAt(start, start.selection.main.head);
  if (!table) return transaction;
  const changes: { from: number; to: number; text: string }[] = [];
  transaction.changes.iterChanges((...[from, to, , , inserted]: ChangeArguments) => {
    changes.push({ from, to, text: inserted.toString() });
  });
  const isKept = changes.every(
    ({ from, to }) => isChangeKeptInCells(table, from, to) || isAtTableEdge(table, from, to),
  );
  if (!isKept) return {};
  const escapedChanges = changes.map(({ from, to, text }) => {
    const isCellText = isInTable(table, from, to) && !isAtTableEdge(table, from, to);
    return { from, to, text, insert: isCellText ? escapedCellText(text) : text };
  });
  if (escapedChanges.every(({ text, insert }) => insert === text)) return transaction;
  const escaped = start.changes(escapedChanges.map(({ from, to, insert }) => ({ from, to, insert })));
  return {
    changes: escaped,
    selection: start.selection.map(escaped, 1),
    userEvent: transaction.annotation(Transaction.userEvent) ?? 'input',
    scrollIntoView: transaction.scrollIntoView,
  };
}

const COMPOSITION_END_CHECK_MS = 20;
const COMPOSITION_END_CHECKS = 10;

/** Where a composition in a grid cell started; its text runs from there to the caret when it ends. */
const compositionStarts = new WeakMap<EditorView, number>();

export function noteCompositionStart(view: EditorView): void {
  const { head } = view.state.selection.main;
  const table = gridTableAt(view.state, head);
  if (table && cellAt(table, head)) compositionStarts.set(view, head);
  else compositionStarts.delete(view);
}

/**
 * Once a composition in a cell ends, a pipe or line break it wrote is escaped, as typing would have
 * been. The editor reports the composition over a moment after its end event, so this waits for that.
 */
export function escapeCellAfterComposition(view: EditorView, checksLeft = COMPOSITION_END_CHECKS): void {
  setTimeout(() => {
    if (!isComposing(view)) escapeComposedText(view);
    else if (checksLeft > 1) escapeCellAfterComposition(view, checksLeft - 1);
  }, COMPOSITION_END_CHECK_MS);
}

function escapeComposedText(view: EditorView): void {
  const start = compositionStarts.get(view);
  compositionStarts.delete(view);
  const { head } = view.state.selection.main;
  if (start === undefined || start > head) return;
  const text = view.state.sliceDoc(start, head);
  if (!isEscapingNeeded(text)) return;
  const insert = escapedCellText(text);
  view.dispatch({
    changes: { from: start, to: head, insert },
    selection: EditorSelection.cursor(start + insert.length),
    annotations: gridEdit.of(true),
    userEvent: 'input',
  });
}

/**
 * Cells copied from a spreadsheet, told apart by their tabs, fill the grid from the caret's cell
 * to the right and down, as one undo step. Other text pastes into the cell, escaped.
 */
export function pasteSpreadsheetCells(event: ClipboardEvent, view: EditorView): boolean {
  const text = event.clipboardData?.getData('text/plain') ?? '';
  if (!text.includes('\t')) return false;
  const { state } = view;
  const table = gridTableAt(state, state.selection.main.head);
  const start = table && cellAt(table, state.selection.main.head);
  if (!table || !start) return false;
  const values = parseSpreadsheetCells(text);
  if (values.length === 0) return false;
  event.preventDefault();
  view.dispatch({ ...pastedCellsFill(state, { table, start, values }), annotations: gridEdit.of(true) });
  return true;
}
