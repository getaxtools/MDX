import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSourceEditor, type SourceEditor, type SourceEditorOptions } from '../createSourceEditor';

let editor: SourceEditor | undefined;

function openEditor(text: string, options: Partial<SourceEditorOptions> = {}): EditorView {
  const parent = document.createElement('div');
  document.body.append(parent);
  editor = createSourceEditor({ parent, text, label: 'Source', phrases: {}, onChange: vi.fn(), ...options });
  const view = EditorView.findFromDOM(parent.querySelector<HTMLElement>('.cm-editor') ?? parent);
  if (!view) throw new Error('The editor view was not created');
  view.dispatch({ selection: { anchor: text.length } });
  return view;
}

function pressCtrlShiftV(view: EditorView, init: KeyboardEventInit = {}): void {
  view.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'V', ctrlKey: true, shiftKey: true, bubbles: true, ...init }),
  );
}

function releaseKey(view: EditorView): void {
  view.contentDOM.dispatchEvent(new KeyboardEvent('keyup', { key: 'V', bubbles: true }));
}

/** A paste whose clipboard holds the given types and files, as the browser fires it. */
function paste(view: EditorView, data: Readonly<Record<string, string>>, files: readonly File[] = []): void {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: (type: string) => data[type] ?? '', files, types: Object.keys(data) },
  });
  view.contentDOM.dispatchEvent(event);
}

const PICTURE = new File([new Uint8Array([137, 80, 78, 71])], 'chart.png', { type: 'image/png' });

describe('paste as plain text', () => {
  afterEach(() => {
    editor?.destroy();
    editor = undefined;
    document.body.replaceChildren();
  });

  it('Ctrl+Shift+V pastes the plain text of an HTML clipboard', () => {
    const view = openEditor('Area: ');

    pressCtrlShiftV(view);
    paste(view, { 'text/html': '<b>\\(x\\)</b>', 'text/plain': '\\(x\\)' });

    expect(view.state.doc.toString()).toBe('Area: \\(x\\)');
  });

  it('plain paste ignores picture files', () => {
    const onPastePicture = vi.fn(() => Promise.resolve('![chart](assets/chart.png)'));
    const view = openEditor('', { onPastePicture });

    pressCtrlShiftV(view);
    paste(view, { 'text/plain': 'chart' }, [PICTURE]);

    expect(onPastePicture).not.toHaveBeenCalled();
    expect(view.state.doc.toString()).toBe('chart');
  });

  it('the request ends with the key press, so the next paste is an ordinary one', async () => {
    const onPastePicture = vi.fn(() => Promise.resolve('![chart](assets/chart.png)'));
    const view = openEditor('', { onPastePicture });

    pressCtrlShiftV(view);
    releaseKey(view);
    paste(view, { 'text/plain': 'chart' }, [PICTURE]);

    await vi.waitFor(() => expect(onPastePicture).toHaveBeenCalledOnce());
  });

  it('Ctrl+Shift+V while composing changes nothing', async () => {
    const onPastePicture = vi.fn(() => Promise.resolve('![chart](assets/chart.png)'));
    const view = openEditor('Text', { onPastePicture });

    view.contentDOM.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    pressCtrlShiftV(view, { isComposing: true, keyCode: 229 });
    view.contentDOM.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
    paste(view, { 'text/plain': 'chart' }, [PICTURE]);

    const textAfterTheKey = view.state.doc.toString();

    await vi.waitFor(() => expect(onPastePicture).toHaveBeenCalledOnce());
    expect(textAfterTheKey).toBe('Text');
  });

  it('Ctrl+Shift+V writes line breaks and leaves out control characters as the Edit menu does', () => {
    const view = openEditor('');

    pressCtrlShiftV(view);
    paste(view, { 'text/plain': 'one\r\ntwo\rthree\u0007\u001b[31m\u0085\tfour\n' });

    expect(view.state.doc.toString()).toBe('one\ntwo\nthree[31m\tfour\n');
  });

  it('plain paste keeps the direction marks of right-to-left text', () => {
    const rightToLeft = '‏שלום ‫abc‬ ⁧x⁩';
    const view = openEditor('');

    pressCtrlShiftV(view);
    paste(view, { 'text/plain': rightToLeft });

    expect(view.state.doc.toString()).toBe(rightToLeft);
  });

  it('one undo removes the plain paste', () => {
    const view = openEditor('Area: ');
    pressCtrlShiftV(view);
    paste(view, { 'text/plain': 'pasted' });

    editor?.run('undo');

    expect(view.state.doc.toString()).toBe('Area: ');
  });
});
