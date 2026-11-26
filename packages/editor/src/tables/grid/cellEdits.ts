import {
  Annotation,
  EditorSelection,
  type ChangeSpec,
  type EditorState,
  type TransactionSpec,
} from '@codemirror/state';
import type { MarkdownTable, TableCell, TableRow } from '../tableCells';

/** The grid's own edits, already cell-local and escaped, which the edit filter lets through. */
export const gridEdit = Annotation.define<boolean>();

/** Characters between two cell boundaries: the padding and the pipe. */
const EMPTY_CELL = '  |';

/** A pipe stays a pipe in the cell when a backslash escapes it, and a line break becomes `<br>`. */
export function escapedCellText(text: string): string {
  let escaped = '';
  let backslashes = 0;
  for (const character of text.replaceAll(/\r\n?|\n/g, '<br>')) {
    if (character === '|' && backslashes % 2 === 0) escaped += '\\';
    escaped += character;
    backslashes = character === '\\' ? backslashes + 1 : 0;
  }
  return escaped;
}

/** Whether a cell's text holds a pipe or line break that would split its row. */
export function isEscapingNeeded(text: string): boolean {
  return escapedCellText(text) !== text;
}

export function cellAt(table: MarkdownTable, position: number): TableCell | undefined {
  return table.cells.find((cell) => cell.from <= position && position <= cell.to);
}

export function cellOf(table: MarkdownTable, row: number, column: number): TableCell | undefined {
  return table.cells.find((cell) => cell.row === row && cell.column === column);
}

/** The text the delimiter row writes for a column of a new table cell. */
const NEW_DELIMITER_CELL = ' --- |';
/** A row without its closing pipe gets new cells without one either. */
const CLOSING_PIPE = ' |';

function withoutClosingPipe(cells: string): string {
  return ` |${cells.slice(0, -CLOSING_PIPE.length)}`;
}

/**
 * How one changed range of a user edit relates to a table: inside one cell, outside the table, or
 * over the whole table may go ahead; anything else would break the grid's rows.
 */
export function isChangeKeptInCells(table: MarkdownTable, from: number, to: number): boolean {
  if (to < table.from || from > table.to) return true;
  if (from <= table.from && to >= table.to) return true;
  return table.cells.some((cell) => cell.from <= from && to <= cell.to);
}

/** The row's text ends with its closing pipe, so new cells go after it. */
function hasClosingPipe(state: EditorState, row: TableRow): boolean {
  return state.sliceDoc(row.to - 1, row.to) === '|';
}

/**
 * The cells a short row lacks, added after its last cell; the caret goes into the first added one.
 * Only that row changes.
 */
export function missingCellsAdded(
  state: EditorState,
  row: TableRow,
): { readonly changes: ChangeSpec; readonly firstAddedCell: number } | undefined {
  if (row.missingCells === 0) return undefined;
  const isClosed = hasClosingPipe(state, row);
  const insert = isClosed
    ? EMPTY_CELL.repeat(row.missingCells)
    : ` |${EMPTY_CELL.repeat(row.missingCells - 1)} `;
  const firstAddedCell = isClosed ? row.to + 1 : row.to + ' | '.length;
  return { changes: { from: row.to, insert }, firstAddedCell };
}

function newRowText(columnCount: number, values: readonly string[]): string {
  const cells = Array.from({ length: columnCount }, (_, column) => escapedCellText(values[column] ?? ''));
  return `| ${cells.join(' | ')} |`;
}

/**
 * Spreadsheet cells pasted into a grid cell fill it and the cells to the right and below, adding
 * columns and rows where the paste reaches past the table, as one change. Only the filled cells and
 * the added cells and rows change.
 */
export function pastedCellsFill(
  state: EditorState,
  {
    table,
    start,
    values,
  }: {
    readonly table: MarkdownTable;
    readonly start: TableCell;
    readonly values: readonly (readonly string[])[];
  },
): TransactionSpec {
  const pastedWidth = Math.max(...values.map((row) => row.length));
  const columnCount = Math.max(table.columnCount, start.column + pastedWidth);
  const changes: ChangeSpec[] = [];
  const delimiterRowEnd = state.doc.lineAt(table.rows[0]?.to ?? table.from).to + 1;
  const delimiterLine = state.doc.lineAt(Math.min(delimiterRowEnd, state.doc.length));
  for (const row of table.rows) {
    const rowValues = values[row.index - start.row];
    changes.push(...rowChanges(state, { table, row, start, columnCount }, rowValues));
  }
  if (columnCount > table.columnCount && delimiterLine.number > 1) {
    const isClosed = delimiterLine.text.trimEnd().endsWith('|');
    const added = NEW_DELIMITER_CELL.repeat(columnCount - table.columnCount);
    changes.push({ from: delimiterLine.to, insert: isClosed ? added : withoutClosingPipe(added) });
  }
  const lastRowIndex = (table.rows.at(-1)?.index ?? 0) + 1;
  const addedRows = values
    .slice(lastRowIndex - start.row)
    .map((rowValues) =>
      newRowText(columnCount, [...Array.from({ length: start.column }, () => ''), ...rowValues]),
    );
  if (addedRows.length > 0) changes.push({ from: table.to, insert: `\n${addedRows.join('\n')}` });
  const change = state.changes(changes);
  const lastFilled = change.mapPos(start.to, 1);
  return { changes: change, selection: EditorSelection.cursor(lastFilled), userEvent: 'input.paste' };
}

interface RowFill {
  readonly table: MarkdownTable;
  readonly row: TableRow;
  readonly start: TableCell;
  readonly columnCount: number;
}

function rowChanges(
  state: EditorState,
  { table, row, start, columnCount }: RowFill,
  rowValues: readonly string[] | undefined,
): ChangeSpec[] {
  const changes: ChangeSpec[] = [];
  const existingCount = table.columnCount - row.missingCells;
  for (const [offset, value] of (rowValues ?? []).entries()) {
    const cell = cellOf(table, row.index, start.column + offset);
    if (cell) changes.push({ from: cell.from, to: cell.to, insert: escapedCellText(value) });
  }
  const reach = rowValues ? start.column + rowValues.length : 0;
  const neededCount = Math.max(columnCount > table.columnCount ? columnCount : 0, reach);
  if (neededCount > existingCount) {
    const added = Array.from({ length: neededCount - existingCount }, (_, index) =>
      escapedCellText(rowValues?.[existingCount + index - start.column] ?? ''),
    );
    const isClosed = hasClosingPipe(state, row);
    const insert = added.map((value) => ` ${value} |`).join('');
    changes.push({ from: row.to, insert: isClosed ? insert : withoutClosingPipe(insert) });
  }
  return changes;
}
