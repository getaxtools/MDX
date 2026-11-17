import { Decoration } from '@codemirror/view';
import type { EditorState, Range } from '@codemirror/state';
import type { RichTextBlock } from '../../rich-text/richTextProviders';
import { richTextRenderingFacet } from '../../rich-text/richTextRendering';
import { tableOf, type MarkdownTable, type TableCell, type TableRow } from '../tableCells';
import {
  cellAttributes,
  EmptyLiveCellWidget,
  GRID_ROW_CLASS,
  GridCellWidget,
  GridWidget,
  LIVE_CELL_CLASS,
  type CellAlignment,
  type CellPlace,
} from './gridWidgets';

const HIDDEN = Decoration.replace({});

let gridBuildCount = 0;

/** The column alignments a delimiter row writes, such as `:---:` for centred. */
function alignmentsOf(delimiterLine: string): CellAlignment[] {
  const segments = delimiterLine.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
  return segments.map((segment) => {
    const marks = segment.trim();
    const isLeft = marks.startsWith(':');
    const isRight = marks.endsWith(':');
    if (isLeft && isRight) return 'center';
    if (isRight) return 'right';
    return isLeft ? 'left' : undefined;
  });
}

/** The cell holding the caret, or the nearest one before it, as from a pipe the caret is about to leave. */
export function liveCellOf(table: MarkdownTable, head: number): TableCell | undefined {
  if (head < table.from || head > table.to) return undefined;
  const containing = table.cells.find((cell) => cell.from <= head && head <= cell.to);
  if (containing) return containing;
  return table.cells.reduce<TableCell | undefined>(
    (found, cell) => (cell.from <= head ? cell : found),
    undefined,
  );
}

interface RowLayout {
  readonly state: EditorState;
  readonly row: TableRow;
  readonly cells: readonly TableCell[];
  readonly alignments: readonly CellAlignment[];
  readonly liveCell: TableCell | undefined;
}

function placeOf(row: TableRow, column: number, alignments: readonly CellAlignment[]): CellPlace {
  return { row: row.index, column, isHeader: row.isHeader, alignment: alignments[column] };
}

function liveCellDecorations(cell: TableCell, place: CellPlace): Range<Decoration>[] {
  if (cell.from === cell.to) {
    return [Decoration.widget({ widget: new EmptyLiveCellWidget(place), side: 1 }).range(cell.from)];
  }
  const attributes = cellAttributes(place);
  return [Decoration.mark({ class: LIVE_CELL_CLASS, attributes }).range(cell.from, cell.to)];
}

/**
 * Each cell is one grid item: a rendered widget over the cell and the pipe and padding before it,
 * or, for the live cell, its own text with the pipe and padding around it hidden.
 */
function rowCellDecorations({ state, row, cells, alignments, liveCell }: RowLayout): Range<Decoration>[] {
  const line = state.doc.lineAt(row.from);
  const decorations: Range<Decoration>[] = [];
  let start = line.from;
  for (const [index, cell] of cells.entries()) {
    const end = index === cells.length - 1 ? line.to : cell.to;
    const place = placeOf(row, cell.column, alignments);
    if (cell === liveCell) {
      if (start < cell.from) decorations.push(HIDDEN.range(start, cell.from));
      decorations.push(...liveCellDecorations(cell, place));
      if (cell.to < end) decorations.push(HIDDEN.range(cell.to, end));
    } else {
      const widget = new GridCellWidget(state.sliceDoc(cell.from, cell.to), place);
      decorations.push(
        start < end
          ? Decoration.replace({ widget }).range(start, end)
          : Decoration.widget({ widget, side: 1 }).range(start),
      );
    }
    start = end;
  }
  for (let missing = 0; missing < row.missingCells; missing += 1) {
    const place = placeOf(row, cells.length + missing, alignments);
    decorations.push(Decoration.widget({ widget: new GridCellWidget('', place), side: 1 }).range(line.to));
  }
  return decorations;
}

/**
 * The table as a grid while the caret is in it: every row a grid row of its line, every cell
 * rendered except the live cell, which stays editor text, and the delimiter row hidden.
 */
export function liveGridDecorations(block: RichTextBlock): Range<Decoration>[] {
  const { state } = block;
  const table = tableOf(state, block.node);
  const [header] = table.rows;
  if (!header || table.columnCount === 0) return [];
  gridBuildCount += 1;
  const rowId = (row: TableRow) => `cm-table-grid-${String(gridBuildCount)}-${String(row.index)}`;
  const headerLine = state.doc.lineAt(header.from);
  const delimiterLine = state.doc.line(headerLine.number + 1);
  const alignments = alignmentsOf(delimiterLine.text);
  const liveCell = liveCellOf(table, state.selection.main.head);
  const label = state.facet(richTextRenderingFacet)?.labels.table(table.rows.length, table.columnCount) ?? '';
  const decorations: Range<Decoration>[] = [
    Decoration.widget({ widget: new GridWidget(label, table.rows.map(rowId)), block: true, side: -1 }).range(
      headerLine.from,
    ),
    HIDDEN.range(headerLine.to, delimiterLine.to),
  ];
  for (const row of table.rows) {
    const line = state.doc.lineAt(row.from);
    const attributes = {
      role: 'row',
      id: rowId(row),
      style: `--cm-table-columns: ${String(table.columnCount)}`,
    };
    decorations.push(Decoration.line({ class: GRID_ROW_CLASS, attributes }).range(line.from));
    const cells = table.cells.filter((cell) => cell.row === row.index);
    decorations.push(...rowCellDecorations({ state, row, cells, alignments, liveCell }));
  }
  return decorations;
}
