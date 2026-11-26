import { EditorSelection } from '@codemirror/state';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openRichTextEditor, placeCaret, type TestEditor } from '../rich-text/richTextTestEditor';
import type { FormulaEditRequest } from './formulaRequests';

const FORMULA_DOCUMENT = 'Intro.\n\n$$\nE = mc^2\n$$\n\nArea $x^2$ here.';

let opened: TestEditor | undefined;

function openWithEquationEditor(text: string) {
  const onEditFormula = vi.fn<(request: FormulaEditRequest) => void>();
  opened = openRichTextEditor(text, { onEditFormula });
  return { ...opened, onEditFormula };
}

/** CodeMirror tells Ctrl+Shift+letter keys by their key code, which jsdom leaves at 0. */
function press(editor: TestEditor, init: KeyboardEventInit): boolean {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  const key = init.key ?? '';
  if (/^[A-Z]$/.test(key)) Object.defineProperty(event, 'keyCode', { value: key.charCodeAt(0) });
  editor.view.contentDOM.dispatchEvent(event);
  return event.defaultPrevented;
}

function pressOn(element: Element | null | undefined): void {
  element?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
}

function renderedFormula(editor: TestEditor, source: string): Element | null {
  return editor.view.contentDOM.querySelector(`[role="img"][aria-label="Formula ${source}"]`);
}

describe('opening the equation editor', () => {
  afterEach(() => {
    opened?.close();
    opened = undefined;
  });

  it('Alt+= opens it for a new inline formula at the caret', () => {
    const editor = openWithEquationEditor('Area is ');

    press(editor, { key: '=', altKey: true });

    expect(editor.onEditFormula).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'inline',
        source: '',
        isExisting: false,
        target: { from: 8, to: 8, original: '' },
      }),
    );
  });

  it('Ctrl+Shift+M opens it for a display formula with the selection as its source', () => {
    const editor = openWithEquationEditor('Sum a^2+b^2 here');
    editor.view.dispatch({ selection: EditorSelection.single(4, 11) });

    press(editor, { key: 'M', ctrlKey: true, shiftKey: true });

    expect(editor.onEditFormula).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'display', source: 'a^2+b^2', isExisting: false }),
    );
  });

  it('Alt+= with the caret inside a formula opens it on that formula', () => {
    const editor = openWithEquationEditor(FORMULA_DOCUMENT);
    placeCaret(editor.view, FORMULA_DOCUMENT.indexOf('x^2') + 1);

    press(editor, { key: '=', altKey: true });

    expect(editor.onEditFormula).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'inline', source: 'x^2', isExisting: true }),
    );
  });

  it('$$ then Enter on an empty line starts a display formula', () => {
    const editor = openWithEquationEditor('Intro.\n\n$$');

    const isHandled = press(editor, { key: 'Enter' });

    expect(isHandled).toBe(true);
    expect(editor.onEditFormula).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'display', source: '', target: { from: 8, to: 10, original: '$$' } }),
    );
    expect(editor.view.state.doc.toString()).toBe('Intro.\n\n$$');
  });

  it('Enter after $$ that closes a display formula is an ordinary line break', () => {
    const editor = openWithEquationEditor('$$\nx\n$$');

    press(editor, { key: 'Enter' });

    expect(editor.onEditFormula).not.toHaveBeenCalled();
    expect(editor.view.state.doc.toString()).toBe('$$\nx\n$$\n');
  });

  it.each([
    ['a fenced code block', '```\n$$\n```', 6],
    ['an indented code block', 'Text\n\n    $$\n', 12],
    ['front matter', '---\n$$\n---\n\nText', 6],
  ])('$$ then Enter in %s is an ordinary line break', (_where, text, caret) => {
    const editor = openWithEquationEditor(text);
    placeCaret(editor.view, caret);

    press(editor, { key: 'Enter' });

    expect(editor.onEditFormula).not.toHaveBeenCalled();
    expect(editor.view.state.sliceDoc(0, caret + 1)).toBe(`${text.slice(0, caret)}\n`);
  });

  it('moving the caret into a formula does not open the dialog', () => {
    const editor = openWithEquationEditor(FORMULA_DOCUMENT);
    placeCaret(editor.view, 0);

    for (let step = 0; step < 4; step += 1) press(editor, { key: 'ArrowDown' });
    placeCaret(editor.view, FORMULA_DOCUMENT.indexOf('x^2') + 1);

    expect(editor.onEditFormula).not.toHaveBeenCalled();
  });

  it('a press on a rendered display formula puts the caret in its source and opens the dialog on it', () => {
    const editor = openWithEquationEditor(FORMULA_DOCUMENT);
    placeCaret(editor.view, 0);

    pressOn(renderedFormula(editor, 'E = mc^2'));

    expect(editor.view.state.selection.main.head).toBe(FORMULA_DOCUMENT.indexOf('E = mc^2'));
    expect(renderedFormula(editor, 'E = mc^2')).toBeNull();
    expect(editor.onEditFormula).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'display', source: 'E = mc^2', isExisting: true }),
    );
  });

  it('a click without a press, as assistive technology sends, opens the dialog on the formula', () => {
    const editor = openWithEquationEditor(FORMULA_DOCUMENT);
    placeCaret(editor.view, 0);

    renderedFormula(editor, 'E = mc^2')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
    );

    expect(editor.view.state.selection.main.head).toBe(FORMULA_DOCUMENT.indexOf('E = mc^2'));
    expect(editor.onEditFormula).toHaveBeenCalledOnce();
  });

  it('a press and the click after it open the dialog once', () => {
    const editor = openWithEquationEditor(FORMULA_DOCUMENT);
    placeCaret(editor.view, 0);
    const formula = renderedFormula(editor, 'x^2');

    pressOn(formula);
    formula?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    expect(editor.onEditFormula).toHaveBeenCalledOnce();
  });

  it('a press on a rendered inline formula opens the dialog on it', () => {
    const editor = openWithEquationEditor(FORMULA_DOCUMENT);
    placeCaret(editor.view, 0);

    pressOn(renderedFormula(editor, 'x^2'));

    expect(editor.view.state.selection.main.head).toBe(FORMULA_DOCUMENT.indexOf('x^2'));
    expect(editor.onEditFormula).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'inline', source: 'x^2' }),
    );
  });

  it('without an equation editor a press on a formula still shows its source', () => {
    opened = openRichTextEditor(FORMULA_DOCUMENT);
    placeCaret(opened.view, 0);

    pressOn(renderedFormula(opened, 'E = mc^2'));

    expect(renderedFormula(opened, 'E = mc^2')).toBeNull();
    expect(opened.view.state.selection.main.head).toBe(FORMULA_DOCUMENT.indexOf('E = mc^2'));
  });

  it('Edit Formula from the preview opens the formula the preview counted', () => {
    const editor = openWithEquationEditor('$a$ and $b$ and $a$');

    const isOpened = editor.editor.editFormulaInOrder(2, 'a');
    const isOpenedByItsSource = editor.editor.editFormulaInOrder(0, 'b');

    expect(isOpened).toBe(true);
    expect(isOpenedByItsSource).toBe(true);
    expect(editor.onEditFormula.mock.calls.map(([request]) => request.target.from)).toEqual([17, 9]);
  });

  it('Ctrl+Shift+I asks the app for picture files', () => {
    const onChoosePictures = vi.fn();
    opened = openRichTextEditor('Text', { onChoosePictures });

    press(opened, { key: 'I', ctrlKey: true, shiftKey: true });

    expect(onChoosePictures).toHaveBeenCalledOnce();
  });

  it('the equation editor writes its formula back as one undo step', () => {
    const editor = openWithEquationEditor('Area is ');
    press(editor, { key: '=', altKey: true });
    const request = editor.onEditFormula.mock.calls[0]?.[0];

    const outcome = request
      ? editor.editor.insertFormula(request.target, { tex: '\\pi r^2', kind: 'inline' })
      : undefined;
    const written = editor.view.state.doc.toString();
    editor.editor.run('undo');

    expect(outcome).toBe('written');
    expect(written).toBe('Area is $\\pi r^2$');
    expect(editor.view.state.doc.toString()).toBe('Area is ');
  });
});
