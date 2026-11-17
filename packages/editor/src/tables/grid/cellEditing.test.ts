import { EditorSelection } from '@codemirror/state';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { measureTextAsEmpty, pasteInto } from '../../formula-paste/pasteTestEvents';
import { openRichTextEditor, placeCaret, type TestEditor } from '../../rich-text/richTextTestEditor';
import { escapedCellText } from './cellEdits';

const PADDED_TABLE = ['| Name   | Qty |', '|--------|----:|', '| Pear   |   2 |', '| Plum   |  10 |'].join(
  '\n',
);
const PEAR_END = PADDED_TABLE.indexOf('Pear') + 'Pear'.length;

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

function open(text: string, caret: number): TestEditor {
  opened = openRichTextEditor(text);
  placeCaret(opened.view, caret);
  return opened;
}

function typed(editor: TestEditor, text: string, userEvent = 'input.type'): void {
  editor.view.dispatch(editor.view.state.replaceSelection(text), { userEvent });
}

function lines(editor: TestEditor): string[] {
  return editor.view.state.doc.toString().split('\n');
}

describe('editing grid cells', () => {
  it('typing changes only the cell range', () => {
    const editor = open(`${PADDED_TABLE}\n\nEnd`, PEAR_END);
    const before = lines(editor);

    typed(editor, 's in a bowl');

    const after = lines(editor);
    expect(after[2]).toBe('| Pears in a bowl   |   2 |');
    expect(after.filter((_, index) => index !== 2)).toEqual(before.filter((_, index) => index !== 2));
  });

  it('deleting over a pipe is refused', () => {
    const editor = open(`${PADDED_TABLE}\n\nEnd`, PEAR_END);
    editor.view.dispatch({ selection: EditorSelection.cursor(PADDED_TABLE.indexOf('Pear')) });

    editor.view.dispatch({
      changes: { from: PADDED_TABLE.indexOf('Pear') - 2, to: PADDED_TABLE.indexOf('Pear') },
      userEvent: 'delete.backward',
    });

    expect(editor.view.state.doc.toString()).toBe(`${PADDED_TABLE}\n\nEnd`);
  });

  it('pasted pipe becomes an escaped pipe', async () => {
    const editor = open(`${PADDED_TABLE}\n\nEnd`, PEAR_END);

    pasteInto(editor.view, { 'text/plain': 'a|b' });
    await Promise.resolve();

    expect(lines(editor)[2]).toBe('| Peara\\|b   |   2 |');
  });

  it('pasted line break becomes br', () => {
    const editor = open(`${PADDED_TABLE}\n\nEnd`, PEAR_END);

    pasteInto(editor.view, { 'text/plain': 'one\r\ntwo' });

    expect(lines(editor)[2]).toBe('| Pearone<br>two   |   2 |');
  });

  it('an escaped pipe is not escaped again', () => {
    expect(escapedCellText('a\\|b')).toBe('a\\|b');
    expect(escapedCellText('a\\\\|b')).toBe('a\\\\\\|b');
  });

  it('editing another row leaves a short row unchanged', () => {
    const table = ['| A | B | C |', '|---|---|---|', '| 1 | 2 |', '| x | y | z |'].join('\n');
    const editor = open(`${table}\n\nEnd`, table.indexOf('z') + 1);

    typed(editor, 'zz');

    expect(lines(editor)[2]).toBe('| 1 | 2 |');
    expect(lines(editor)[3]).toBe('| x | y | zzz |');
  });

  it('a press on a missing cell adds the missing pipes to that row only', () => {
    const table = ['| A | B | C |', '|---|---|---|', '| 1 | 2 |', '| x | y | z |'].join('\n');
    const editor = open(`${table}\n\nEnd`, table.indexOf('z'));
    const missingCell = editor.view.contentDOM.querySelector('[data-table-row="1"][data-table-column="2"]');

    missingCell?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    typed(editor, '3');

    expect(lines(editor).slice(2, 4)).toEqual(['| 1 | 2 | 3 |', '| x | y | z |']);
  });

  it('no escaping during composition', async () => {
    const editor = open(`${PADDED_TABLE}\n\nEnd`, PEAR_END);
    editor.view.contentDOM.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));

    typed(editor, '|', 'input.type.compose');
    const whileComposing = lines(editor)[2];
    editor.view.contentDOM.dispatchEvent(
      new CompositionEvent('compositionend', { bubbles: true, data: '|' }),
    );

    expect(whileComposing).toBe('| Pear|   |   2 |');
    await vi.waitFor(() => expect(lines(editor)[2]).toBe('| Pear\\|   |   2 |'));
  });
});
