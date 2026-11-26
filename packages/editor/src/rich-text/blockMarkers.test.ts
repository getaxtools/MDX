import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { parseWholeDocument } from './parseWholeDocument';
import { openRichTextEditor } from './richTextTestEditor';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSourceEditor, type SourceEditor } from '../createSourceEditor';

let editor: SourceEditor | undefined;

function openRichText(text: string) {
  const parent = document.createElement('div');
  document.body.append(parent);
  const onChange = vi.fn();
  editor = createSourceEditor({
    parent,
    text,
    label: 'Source',
    phrases: {},
    onChange,
    editingMode: 'richText',
  });
  const view = EditorView.findFromDOM(parent.querySelector<HTMLElement>('.cm-editor') ?? parent);
  if (!view) throw new Error('The editor view was not created');
  parseWholeDocument(view);
  return { view, onChange };
}

function shownLines(view: EditorView): string[] {
  return [...view.contentDOM.querySelectorAll('.cm-line')].map((line) => line.textContent);
}

function placeCaretAtEnd(view: EditorView): void {
  view.dispatch({ selection: EditorSelection.cursor(view.state.doc.length) });
}

function pressCtrlEnter(view: EditorView, init: KeyboardEventInit = {}): void {
  view.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true, ...init }),
  );
}

/** A pointer click: the press, then the click. */
function clickCheckbox(checkbox: HTMLElement | undefined): void {
  checkbox?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
  checkbox?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
}

function checkboxes(view: EditorView): HTMLElement[] {
  return [...view.contentDOM.querySelectorAll<HTMLElement>('[role="checkbox"]')];
}

describe('Rich text list, quote and task markers', () => {
  afterEach(() => {
    editor?.destroy();
    editor = undefined;
    document.body.innerHTML = '';
  });

  it('numbers stay as written', () => {
    const { view } = openRichText('3. Third\n7. Seventh\n9) Ninth\n\nEnd');

    placeCaretAtEnd(view);

    expect(shownLines(view).slice(0, 3)).toEqual(['3. Third', '7. Seventh', '9) Ninth']);
  });

  it('bullets show as bullets, and as their marker at the caret', () => {
    const { view } = openRichText('- One\n  * Two\n\nEnd');

    placeCaretAtEnd(view);
    const away = shownLines(view).slice(0, 2);
    view.dispatch({ selection: EditorSelection.cursor(0) });

    expect(away).toEqual(['• One', '  ◦ Two']);
    expect(shownLines(view)[0]).toBe('- One');
  });

  it('quote markers show as a quote bar', () => {
    const { view } = openRichText('> Quoted\n> > Nested\n\nEnd');

    placeCaretAtEnd(view);
    const lines = [...view.contentDOM.querySelectorAll('.cm-line')].slice(0, 2);

    expect(lines.map((line) => line.textContent)).toEqual(['Quoted', 'Nested']);
    expect(lines.every((line) => line.classList.contains('cm-rich-quote'))).toBe(true);
    expect(lines[1]?.classList.contains('cm-rich-quote-2')).toBe(true);
  });

  it('task markers show as checkboxes that report their state', () => {
    const { view } = openRichText('- [ ] Pay rent\n- [x] Buy milk\n\nEnd');

    placeCaretAtEnd(view);

    expect(shownLines(view).slice(0, 2)).toEqual([' Pay rent', ' Buy milk']);
    expect(checkboxes(view).map((box) => box.getAttribute('aria-checked'))).toEqual(['false', 'true']);
    expect(checkboxes(view).every((box) => box.getAttribute('tabindex') === '-1')).toBe(true);
  });

  it('a numbered task shows a checkbox in place of its number, like the preview', () => {
    const { view } = openRichText('1. [x] Pay rent\n\nEnd');

    placeCaretAtEnd(view);

    expect(shownLines(view)[0]).toBe(' Pay rent');
    expect(checkboxes(view).map((box) => box.getAttribute('aria-checked'))).toEqual(['true']);
  });

  it('code keeps the code font with its fences shown', () => {
    const { view } = openRichText('```js\nconst a = **1**;\n```\n\nEnd');

    placeCaretAtEnd(view);
    const codeLines = [...view.contentDOM.querySelectorAll('.cm-rich-code-line')];

    expect(codeLines.map((line) => line.textContent)).toEqual(['```js', 'const a = **1**;', '```']);
  });

  it('ticking changes only the character between the brackets', () => {
    const { view } = openRichText('- [ ] Pay rent\n\nEnd');
    placeCaretAtEnd(view);
    const selectionBefore = view.state.selection;

    clickCheckbox(checkboxes(view)[0]);

    expect(view.state.doc.toString()).toBe('- [x] Pay rent\n\nEnd');
    expect(view.state.selection.eq(selectionBefore)).toBe(true);
  });

  it('a click alone toggles once, as assistive technology sends it', () => {
    const { view } = openRichText('- [ ] Pay rent\n\nEnd');
    placeCaretAtEnd(view);

    checkboxes(view)[0]?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
    );

    expect(view.state.doc.toString()).toBe('- [x] Pay rent\n\nEnd');
  });

  it('Ctrl+Enter toggles every task line in the selection as one undo step', () => {
    const { view } = openRichText('- [ ] One\n- [x] Two\n- [ ] Three\n\nEnd');
    view.dispatch({ selection: EditorSelection.single(3, '- [ ] One\n- [x] Tw'.length) });

    pressCtrlEnter(view);
    const toggled = view.state.doc.toString();
    editor?.run('undo');

    expect(toggled).toBe('- [x] One\n- [ ] Two\n- [ ] Three\n\nEnd');
    expect(view.state.doc.toString()).toBe('- [ ] One\n- [x] Two\n- [ ] Three\n\nEnd');
  });

  it('a task without text has a checkbox named Task', () => {
    const opened = openRichTextEditor('- [ ] \n\nEnd');

    const checkbox = opened.view.contentDOM.querySelector('[role="checkbox"]');

    expect(checkbox?.getAttribute('aria-label')).toBe('Task');
    expect(checkbox?.hasAttribute('aria-labelledby')).toBe(false);
    opened.close();
  });

  it('one undo puts a tick back', () => {
    const { view } = openRichText('- [ ] Pay rent\n\nEnd');
    placeCaretAtEnd(view);
    view.dispatch({ changes: { from: view.state.doc.length, insert: '!' }, userEvent: 'input.type' });

    clickCheckbox(checkboxes(view)[0]);
    editor?.run('undo');

    expect(view.state.doc.toString()).toBe('- [ ] Pay rent\n\nEnd!');
  });

  it('Ctrl+Enter on a task line toggles it', () => {
    const { view } = openRichText('- [x] Pay rent\n\nEnd');
    view.dispatch({ selection: EditorSelection.cursor('- [x] Pay'.length) });

    pressCtrlEnter(view);

    expect(view.state.doc.toString()).toBe('- [ ] Pay rent\n\nEnd');
  });

  it('Ctrl+Enter elsewhere inserts a blank line', () => {
    const { view } = openRichText('- [ ] Pay rent\n\nEnd');
    placeCaretAtEnd(view);

    pressCtrlEnter(view);

    expect(view.state.doc.toString()).toBe('- [ ] Pay rent\n\nEnd\n');
  });

  it('Ctrl+Enter while composing does nothing', () => {
    const { view, onChange } = openRichText('- [ ] Pay rent\n\nEnd');
    view.dispatch({ selection: EditorSelection.cursor('- [ ] Pay'.length) });

    view.contentDOM.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    pressCtrlEnter(view, { isComposing: true });

    expect(view.state.doc.toString()).toBe('- [ ] Pay rent\n\nEnd');
    expect(onChange).not.toHaveBeenCalled();
  });
});
