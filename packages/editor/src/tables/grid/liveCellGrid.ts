import { EditorState, Prec, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, keymap } from '@codemirror/view';
import type { RichTextBlock } from '../../rich-text/richTextProviders';
import { tableOf } from '../tableCells';
import {
  cellLocalEdits,
  escapeCellAfterComposition,
  noteCompositionStart,
  pasteSpreadsheetCells,
} from './cellEditing';
import { liveGridDecorations } from './gridLayout';
import {
  caretKeptInCells,
  enterPressedCell,
  isShownAsGrid,
  leaveGrid,
  moveToCellAbove,
  moveToCellBelow,
  moveToNextCell,
  moveToPreviousCell,
} from './gridNavigation';
import { GRID_CELL_CLASS, GRID_CLASS, GRID_ROW_CLASS, LIVE_CELL_CLASS } from './gridWidgets';
import { tablesAsText } from './tablesAsText';

/**
 * The live-cell grid: a table in Rich text stays a grid while the caret is in it, with the cell at
 * the caret as editor text. Everything about editing tables as a grid is behind this module, so
 * Rich text can show tables as a rendered grid with Edit table as text instead by not using it.
 */
export interface TableGrid {
  /** The decorations of a table the caret is in: the grid, or none to show the table's Markdown. */
  decorationsWhileRevealed(block: RichTextBlock): readonly Range<Decoration>[];
  /** Keys, clicks, pastes and edit rules of the grid. */
  extension(): Extension;
}

const gridTheme = EditorView.baseTheme({
  [`.${GRID_CLASS}`]: { height: '0', overflow: 'hidden' },
  [`.cm-line.${GRID_ROW_CLASS}`]: {
    display: 'grid',
    gridTemplateColumns: 'repeat(var(--cm-table-columns), minmax(0, 1fr))',
    alignItems: 'stretch',
    padding: '0',
    borderInline: '1px solid var(--color-border)',
    borderTop: '1px solid var(--color-border)',
  },
  // CodeMirror's caret helpers, hidden ranges and line ends would otherwise take grid cells of their own.
  [`.cm-line.${GRID_ROW_CLASS} > :not(.${GRID_CELL_CLASS}):not(.${LIVE_CELL_CLASS})`]: {
    position: 'absolute',
  },
  [`.cm-line.${GRID_ROW_CLASS} > br`]: { display: 'none' },
  [`.cm-line.${GRID_ROW_CLASS}:has(+ :not(.${GRID_ROW_CLASS}))`]: {
    borderBottom: '1px solid var(--color-border)',
  },
  [`.${GRID_CELL_CLASS}, .${LIVE_CELL_CLASS}`]: {
    display: 'block',
    gridRow: '1',
    minWidth: '0',
    minHeight: '1.5em',
    padding: '0.25em 0.5em',
    overflowWrap: 'anywhere',
    whiteSpace: 'pre-wrap',
  },
  [`.${GRID_ROW_CLASS} [data-table-column]:not([data-table-column="0"])`]: {
    borderInlineStart: '1px solid var(--color-border)',
  },
  [`[role="columnheader"]`]: { fontWeight: '600' },
  [`.${LIVE_CELL_CLASS}`]: { outline: '2px solid var(--color-focus)', outlineOffset: '-2px' },
});

export const LIVE_CELL_GRID: TableGrid = {
  decorationsWhileRevealed: (block) =>
    isShownAsGrid(block.state, tableOf(block.state, block.node)) ? liveGridDecorations(block) : [],
  extension: () => [
    tablesAsText,
    gridTheme,
    EditorState.transactionFilter.of(cellLocalEdits),
    EditorState.transactionFilter.of(caretKeptInCells),
    Prec.high(
      keymap.of([
        { key: 'ArrowRight', run: moveToNextCell },
        { key: 'ArrowLeft', run: moveToPreviousCell },
        { key: 'ArrowDown', run: moveToCellBelow },
        { key: 'ArrowUp', run: moveToCellAbove },
        { key: 'Escape', run: leaveGrid },
      ]),
    ),
    Prec.high(
      EditorView.domEventHandlers({
        mousedown: enterPressedCell,
        paste: pasteSpreadsheetCells,
        compositionstart: (_event, view) => {
          noteCompositionStart(view);
          return false;
        },
        compositionend: (_event, view) => {
          escapeCellAfterComposition(view);
          return false;
        },
      }),
    ),
  ],
};

/**
 * The grid Rich text uses. Should the live cell not hold up with input methods or screen readers,
 * a rendered grid with Edit table as text takes its place here.
 */
export const TABLE_GRID: TableGrid = LIVE_CELL_GRID;
