import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { tableAt } from './tableCells';
import { selectNextCell, selectPreviousCell } from './tableNavigation';

const TABLE = '| Name | Notes \\| more |\n|---|---|\n| a |  |\n| short |';

function stateAt(doc: string, position: number, head = position): EditorState {
  return EditorState.create({
    doc,
    selection: EditorSelection.single(position, head),
    extensions: [markdown({ base: markdownLanguage })],
  });
}

function cellTexts(doc: string): string[] {
  const table = tableAt(stateAt(doc, 0), 0);
  return table?.cells.map((cell) => doc.slice(cell.from, cell.to)) ?? [];
}

function afterCommand(state: EditorState, command: typeof selectNextCell): EditorState {
  let next = state;
  command({ state, dispatch: (transaction) => (next = transaction.state) });
  return next;
}

const selectedText = (state: EditorState) =>
  state.sliceDoc(state.selection.main.from, state.selection.main.to);

describe('table cells', () => {
  it('cells exclude padding and pipes', () => {
    expect(cellTexts('| A |  B  |\n|---|---|\n| 1 | 2 |')).toEqual(['A', 'B', '1', '2']);
  });

  it('escaped pipe stays inside its cell', () => {
    expect(cellTexts(TABLE)[1]).toBe('Notes \\| more');
  });

  it('short row reports missing cells', () => {
    const table = tableAt(stateAt(TABLE, 0), 0);

    expect(table?.rows.map((row) => row.missingCells)).toEqual([0, 0, 1]);
  });

  it('header and delimiter rows are told apart', () => {
    const table = tableAt(stateAt(TABLE, 0), 0);

    expect(table?.rows.map((row) => row.isHeader)).toEqual([true, false, false]);
    expect(table?.cells.some((cell) => TABLE.slice(cell.from, cell.to).includes('---'))).toBe(false);
  });

  it('an empty cell is the place where its text goes', () => {
    const table = tableAt(stateAt(TABLE, 0), 0);
    const empty = table?.cells.find((cell) => cell.row === 1 && cell.column === 1);

    expect(empty && empty.from === empty.to).toBe(true);
  });

  it('there is no table outside one', () => {
    expect(tableAt(stateAt('Text\n\n| A |\n|---|', 0), 0)).toBeUndefined();
  });
});

describe('table navigation', () => {
  it('Tab selects the next cell', () => {
    const state = afterCommand(stateAt(TABLE, 2), selectNextCell);

    expect(selectedText(state)).toBe('Notes \\| more');
  });

  it('Shift+Tab from the first body cell goes to the last header cell', () => {
    const state = afterCommand(stateAt(TABLE, TABLE.indexOf('| a') + 2), selectPreviousCell);

    expect(selectedText(state)).toBe('Notes \\| more');
  });

  it('Tab in the last cell adds a row', () => {
    const doc = '| A | B |\n|---|---|\n| 1 | 2 |';
    const state = afterCommand(stateAt(doc, doc.indexOf('2')), selectNextCell);

    expect(state.doc.toString()).toBe('| A | B |\n|---|---|\n| 1 | 2 |\n|  |  |');
    expect(state.selection.main.head).toBe(doc.length + 3);
  });

  it('Tab outside a table is left to indenting', () => {
    const state = stateAt('Plain text', 0);

    expect(selectNextCell({ state, dispatch: () => undefined })).toBe(false);
  });
});
