const QUOTE = '"';
const CELL_SEPARATOR = '\t';
const ROW_SEPARATOR = '\n';

interface ParseState {
  readonly rows: string[][];
  row: string[];
  cell: string;
  isInsideQuotes: boolean;
}

/**
 * Reads cells copied from a spreadsheet: rows on lines, cells separated by tabs, and cells that
 * contain a tab, line break or quote wrapped in quotes with inner quotes doubled, as Excel writes them.
 */
export function parseSpreadsheetCells(copiedText: string): string[][] {
  const text = copiedText.replace(/\r\n?/g, ROW_SEPARATOR);
  const state: ParseState = { rows: [], row: [], cell: '', isInsideQuotes: false };
  for (let index = 0; index < text.length; index += 1) {
    const isEscapedQuote = state.isInsideQuotes && text[index] === QUOTE && text[index + 1] === QUOTE;
    if (isEscapedQuote) {
      state.cell += QUOTE;
      index += 1;
      continue;
    }
    readCharacter(state, text[index] ?? '');
  }
  if (state.cell !== '' || state.row.length > 0) finishRow(state);
  return withoutTrailingEmptyRows(state.rows);
}

function readCharacter(state: ParseState, character: string): void {
  if (character === QUOTE && (state.isInsideQuotes || state.cell === '')) {
    state.isInsideQuotes = !state.isInsideQuotes;
  } else if (state.isInsideQuotes) {
    state.cell += character;
  } else if (character === CELL_SEPARATOR) {
    finishCell(state);
  } else if (character === ROW_SEPARATOR) {
    finishRow(state);
  } else {
    state.cell += character;
  }
}

function finishCell(state: ParseState): void {
  state.row.push(state.cell);
  state.cell = '';
}

function finishRow(state: ParseState): void {
  finishCell(state);
  state.rows.push(state.row);
  state.row = [];
}

function withoutTrailingEmptyRows(rows: string[][]): string[][] {
  const lastFilledIndex = rows.findLastIndex((row) => row.some((cell) => cell.trim() !== ''));
  return rows.slice(0, lastFilledIndex + 1);
}
