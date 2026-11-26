import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { measureTextAsEmpty, pasteInto } from '../../formula-paste/pasteTestEvents';
import { openRichTextEditor, placeCaret, type TestEditor } from '../../rich-text/richTextTestEditor';

const TABLE = ['| A | B | C |', '|---|---|---|', '| 1 | 2 | 3 |'].join('\n');
const FIRST_BODY_CELL = TABLE.indexOf('1');

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

function open(text: string, caret?: number): TestEditor {
  opened = openRichTextEditor(text);
  if (caret !== undefined) placeCaret(opened.view, caret);
  return opened;
}

function lines(editor: TestEditor): string[] {
  return editor.view.state.doc.toString().split('\n');
}

describe('pasting spreadsheet cells into the grid', () => {
  it('paste fills right and down', () => {
    const editor = open(`${TABLE}\n\nEnd`, FIRST_BODY_CELL);

    pasteInto(editor.view, { 'text/plain': 'x\ty\r\nz\tw\r\n' });

    expect(lines(editor).slice(0, 5)).toEqual([
      '| A | B | C |',
      '|---|---|---|',
      '| x | y | 3 |',
      '| z | w |  |',
      '',
    ]);
  });

  it('paste adds rows and columns', () => {
    const editor = open(`${TABLE}\n\nEnd`, TABLE.indexOf('3'));

    pasteInto(editor.view, { 'text/plain': 'p\tq\nr\ts' });

    expect(lines(editor).slice(0, 4)).toEqual([
      '| A | B | C |  |',
      '|---|---|---| --- |',
      '| 1 | 2 | p | q |',
      '|  |  | r | s |',
    ]);
  });

  it('one undo takes back the whole paste', () => {
    const editor = open(`${TABLE}\n\nEnd`, FIRST_BODY_CELL);
    pasteInto(editor.view, { 'text/plain': 'x\ty\nz\tw' });

    editor.editor.run('undo');

    expect(editor.view.state.doc.toString()).toBe(`${TABLE}\n\nEnd`);
  });

  it('pasted values with pipes are escaped', () => {
    const editor = open(`${TABLE}\n\nEnd`, FIRST_BODY_CELL);

    pasteInto(editor.view, { 'text/plain': 'a|b\tc' });

    expect(lines(editor)[2]).toBe('| a\\|b | c | 3 |');
  });
});

describe('Edit table as text', () => {
  it('shows the table as Markdown until the caret leaves it', () => {
    const editor = open(`${TABLE}\n\nEnd`, FIRST_BODY_CELL);
    const isGridBefore = editor.view.dom.querySelector('[role="grid"]') !== null;

    editor.editor.run('editTableAsText');
    const shownAsText = editor.view.contentDOM.textContent;
    const isGridWhileText = editor.view.dom.querySelector('[role="grid"]') !== null;
    placeCaret(editor.view, editor.view.state.doc.length);
    placeCaret(editor.view, FIRST_BODY_CELL);

    expect(isGridBefore).toBe(true);
    expect(isGridWhileText).toBe(false);
    expect(shownAsText).toContain('|---|---|---|');
    expect(editor.view.dom.querySelector('[role="grid"]')).not.toBeNull();
  });

  it('is in the block menu actions for the table at the caret', () => {
    const editor = open(`${TABLE}\n\nEnd`, FIRST_BODY_CELL);

    editor.editor.runBlockAction('editTableAsText');

    expect(editor.view.dom.querySelector('[role="grid"]')).toBeNull();
    expect(editor.view.state.doc.toString()).toBe(`${TABLE}\n\nEnd`);
  });
});

describe('tables too large for a grid', () => {
  function tableWithCells(cellCount: number): string {
    const columns = 10;
    const rows = Array.from({ length: cellCount / columns - 1 }, () => `|${' x |'.repeat(columns)}`);
    return [`|${' h |'.repeat(columns)}`, `|${'---|'.repeat(columns)}`, ...rows].join('\n');
  }

  it('large table shows text with a notice', () => {
    const editor = open(`${tableWithCells(3_000)}\n\nEnd`);
    const noticeAway = editor.view.contentDOM.querySelector('.cm-text-notice')?.textContent;

    placeCaret(editor.view, 3);

    expect(noticeAway).toBe('Too large for a grid');
    expect(editor.view.contentDOM.querySelector('.cm-text-notice')?.textContent).toBe('Too large for a grid');
    expect(editor.view.dom.querySelector('[role="grid"]')).toBeNull();
    expect(editor.view.contentDOM.querySelector('.cm-rich-table')).toBeNull();
  });

  it('a table with a line over 10,000 characters shows text with a notice', () => {
    const editor = open(`| A |\n|---|\n| ${'x'.repeat(10_001)} |\n\nEnd`, 3);

    expect(editor.view.contentDOM.querySelector('.cm-text-notice')).not.toBeNull();
    expect(editor.view.dom.querySelector('[role="grid"]')).toBeNull();
  });

  it('a table within the limits has no notice', () => {
    const editor = open(`${tableWithCells(2_000)}\n\nEnd`);

    expect(editor.view.contentDOM.querySelector('.cm-text-notice')).toBeNull();
    expect(editor.view.contentDOM.querySelector('.cm-rich-table')).not.toBeNull();
  });
});
