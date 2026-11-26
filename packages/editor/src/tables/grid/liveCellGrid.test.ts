import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { measureTextAsEmpty } from '../../formula-paste/pasteTestEvents';
import {
  fakeRichTextRendering,
  openRichTextEditor,
  placeCaret,
  type TestEditor,
} from '../../rich-text/richTextTestEditor';

const TABLE = '| A | B |\n|---|---|\n| 1 | 2 |';
const BODY_ROW = '| A | B |\n|---|---|\n'.length;
const CELL_ONE = BODY_ROW + '| '.length;
const CELL_TWO = BODY_ROW + '| 1 | '.length;

let opened: TestEditor | undefined;
let restoreTextMeasuring: () => void;

beforeAll(() => {
  restoreTextMeasuring = measureTextAsEmpty();
});

afterAll(() => {
  restoreTextMeasuring();
});

afterEach(() => {
  opened?.close();
  opened = undefined;
});

function open(text: string): TestEditor {
  opened = openRichTextEditor(text);
  return opened;
}

function press(editor: TestEditor, key: string): void {
  editor.view.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
  );
}

function grid(editor: TestEditor): HTMLElement | null {
  return editor.view.dom.querySelector('[role="grid"]');
}

describe('the live-cell grid', () => {
  it('caret in a cell keeps the grid', () => {
    const editor = open(`${TABLE}\n\nEnd`);

    placeCaret(editor.view, CELL_ONE + 1);

    const liveCell = editor.view.contentDOM.querySelector('.cm-table-live-cell');
    expect(grid(editor)).not.toBeNull();
    expect(editor.view.contentDOM.querySelector('.cm-rich-table')).toBeNull();
    expect(liveCell?.textContent).toBe('1');
    expect(liveCell?.getAttribute('role')).toBe('gridcell');
    expect(editor.view.contentDOM.textContent).not.toContain('|---|');
  });

  it('grid roles and header cells exposed', () => {
    const editor = open(`${TABLE}\n\nEnd`);
    placeCaret(editor.view, CELL_TWO);

    const rows = (grid(editor)?.getAttribute('aria-owns') ?? '')
      .split(' ')
      .map((id) => editor.view.dom.querySelector(`[id="${id}"]`));
    const cellRoles = rows.map((row) =>
      [...(row?.querySelectorAll('[role]') ?? [])].map((cell) => cell.getAttribute('role')),
    );

    expect(grid(editor)?.getAttribute('aria-label')).toBe('Table, 2 rows, 2 columns');
    expect(rows.map((row) => row?.getAttribute('role'))).toEqual(['row', 'row']);
    expect(cellRoles).toEqual([
      ['columnheader', 'columnheader'],
      ['gridcell', 'gridcell'],
    ]);
  });

  it('Right at the end of a cell moves to the next', () => {
    const editor = open(`${TABLE}\n\nEnd`);
    placeCaret(editor.view, CELL_ONE + 1);

    press(editor, 'ArrowRight');
    const afterRight = editor.view.state.selection.main.head;
    press(editor, 'ArrowLeft');

    expect(afterRight).toBe(CELL_TWO);
    expect(editor.view.state.selection.main.head).toBe(CELL_ONE + 1);
    expect(editor.view.contentDOM.querySelector('.cm-table-live-cell')?.textContent).toBe('1');
  });

  it('Up and Down move between rows in the same column, and out of the table', () => {
    const editor = open(`Intro\n\n${TABLE}\n\nEnd`);
    const offset = 'Intro\n\n'.length;
    placeCaret(editor.view, offset + CELL_TWO);

    press(editor, 'ArrowUp');
    const inHeader = editor.view.state.selection.main.head;
    press(editor, 'ArrowDown');
    press(editor, 'ArrowDown');

    expect(inHeader).toBe(offset + '| A | '.length);
    expect(editor.view.state.selection.main.head).toBe(offset + TABLE.length + 1);
  });

  it('Escape puts the caret after the table', () => {
    const editor = open(`${TABLE}\n\nEnd`);
    placeCaret(editor.view, CELL_ONE);

    press(editor, 'Escape');

    expect(editor.view.state.selection.main.head).toBe(TABLE.length + 1);
    expect(grid(editor)).toBeNull();
  });

  it('Escape in a table that ends the document adds the line after it', () => {
    const editor = open(TABLE);
    placeCaret(editor.view, CELL_ONE);

    press(editor, 'Escape');

    expect(editor.view.state.doc.toString()).toBe(`${TABLE}\n`);
    expect(editor.view.state.selection.main.head).toBe(TABLE.length + 1);
  });

  it('a caret on a pipe or the hidden delimiter row moves into the nearest cell', () => {
    const editor = open(`${TABLE}\n\nEnd`);

    placeCaret(editor.view, BODY_ROW);

    expect(editor.view.state.selection.main.head).toBe(CELL_ONE);
  });

  it('a press on a cell of the rendered table enters that cell', () => {
    const renderedTable =
      '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>';
    opened = openRichTextEditor(`End\n\n${TABLE}`, {
      richTextRendering: fakeRichTextRendering({ renderBlock: () => renderedTable }),
    });
    placeCaret(opened.view, 0);
    const secondBodyCell = opened.view.contentDOM.querySelectorAll('.cm-rich-table td')[1];

    secondBodyCell?.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }),
    );

    expect(opened.view.state.selection.main.head).toBe('End\n\n'.length + CELL_TWO + 1);
    expect(grid(opened)).not.toBeNull();
  });

  it('a press on a rendered cell puts the caret at the end of its text', () => {
    const editor = open(`${TABLE}\n\nEnd`);
    placeCaret(editor.view, CELL_ONE);
    const headerCell = editor.view.contentDOM.querySelector('[data-table-row="0"][data-table-column="1"]');

    headerCell?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));

    expect(editor.view.state.selection.main.head).toBe('| A | B'.length);
  });
});
