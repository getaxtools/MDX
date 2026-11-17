import { foldedRanges } from '@codemirror/language';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calloutLineAt, calloutTypeChange } from './calloutMarker';
import { calloutStartChange } from './calloutFolds';
import {
  fakeRichTextRendering,
  openRichTextEditor,
  placeCaret,
  shownLines,
  type TestEditor,
} from './richTextTestEditor';
import { EditorState } from '@codemirror/state';

const COLLAPSED = 'Intro\n\n> [!NOTE]- Can I export?\n> Yes, as PDF.\n\nEnd\n';

let opened: TestEditor | undefined;

function openEditor(text: string, options: Parameters<typeof openRichTextEditor>[1] = {}): TestEditor {
  opened = openRichTextEditor(text, options);
  return opened;
}

function foldButton(editor: TestEditor): HTMLButtonElement | null {
  return editor.view.contentDOM.querySelector<HTMLButtonElement>('.cm-rich-callout-fold');
}

function foldCount(editor: TestEditor): number {
  return foldedRanges(editor.view.state).size;
}

/** Callouts written to start collapsed fold right after Rich text starts. */
async function openFolded(text: string): Promise<TestEditor> {
  const editor = openEditor(text);
  placeCaret(editor.view, text.length);
  await vi.waitFor(() => expect(foldCount(editor)).toBe(1));
  return editor;
}

describe('callout folding', () => {
  afterEach(() => {
    opened?.close();
    opened = undefined;
  });

  it('a callout written with a minus starts collapsed, showing only its title', async () => {
    const editor = await openFolded(COLLAPSED);

    expect(shownLines(editor.view)).not.toContain('Yes, as PDF.');
    expect(foldButton(editor)?.getAttribute('aria-expanded')).toBe('false');
    expect(foldButton(editor)?.textContent).toBe('Can I export?');
  });

  it('expanding leaves the document unchanged', async () => {
    const editor = await openFolded(COLLAPSED);

    foldButton(editor)?.click();

    expect(foldCount(editor)).toBe(0);
    expect(foldButton(editor)?.getAttribute('aria-expanded')).toBe('true');
    expect(editor.onChange).not.toHaveBeenCalled();
    expect(editor.view.state.doc.toString()).toBe(COLLAPSED);
  });

  it('fold state survives an edit above', async () => {
    const editor = await openFolded(COLLAPSED);

    editor.view.dispatch({ changes: { from: 0, insert: 'More ' } });

    expect(foldCount(editor)).toBe(1);
    expect(foldButton(editor)?.getAttribute('aria-expanded')).toBe('false');
  });

  it('the fold button leaves its keys to itself, so Space works as on any button', async () => {
    const editor = await openFolded(COLLAPSED);
    const button = foldButton(editor);
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });

    button?.dispatchEvent(space);

    expect(space.defaultPrevented).toBe(false);
    expect(editor.view.state.doc.toString()).toBe(COLLAPSED);
  });

  it('a callout without a fold sign has no fold button', () => {
    const editor = openEditor('> [!TIP] Shortcut\n> Body\n\nEnd\n');
    placeCaret(editor.view, editor.view.state.doc.length);

    expect(foldButton(editor)).toBeNull();
    expect(editor.view.contentDOM.querySelector('.cm-rich-callout-title')?.textContent).toBe('Shortcut');
  });

  it('a caret moved into a collapsed callout shows its text', async () => {
    const editor = await openFolded(COLLAPSED);

    placeCaret(editor.view, COLLAPSED.indexOf('Yes'));

    expect(foldCount(editor)).toBe(0);
    expect(shownLines(editor.view)).toContain('> Yes, as PDF.');
  });
});

describe('callout commands', () => {
  afterEach(() => {
    opened?.close();
    opened = undefined;
  });

  function startChanged(line: string, start: 'collapsed' | 'expanded'): string {
    const state = EditorState.create({ doc: line });
    const callout = calloutLineAt(state, 0);
    const spec = callout && calloutStartChange(callout, start);
    return spec ? state.update(spec).state.doc.toString() : 'unchanged';
  }

  it('Start collapsed edits one character', () => {
    expect(startChanged('> [!NOTE] Title', 'collapsed')).toBe('> [!NOTE]- Title');
    expect(startChanged('> [!NOTE]+ Title', 'collapsed')).toBe('> [!NOTE]- Title');
    expect(startChanged('> [!NOTE]- Title', 'collapsed')).toBe('unchanged');
  });

  it('Start expanded edits one character', () => {
    expect(startChanged('> [!NOTE] Title', 'expanded')).toBe('> [!NOTE]+ Title');
    expect(startChanged('> [!faq]- Can I export?', 'expanded')).toBe('> [!faq]+ Can I export?');
  });

  it('Start collapsed from the block menu changes the callout at the caret', () => {
    // The block menu opens at the caret, which jsdom does not lay out.
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: () => [new DOMRect(0, 0, 1, 1)],
    });
    const editor = openEditor('> [!NOTE] Title\n> Body\n');
    placeCaret(editor.view, 3);

    const offered = editor.editor.blockAtCaret()?.calloutFold;
    editor.editor.runBlockAction('startCollapsed');
    Reflect.deleteProperty(Range.prototype, 'getClientRects');

    expect(offered).toBe('');
    expect(editor.view.state.doc.toString()).toBe('> [!NOTE]- Title\n> Body\n');
  });

  it('type change replaces only the type word', () => {
    const editor = openEditor('> [!NOTE] Title\n> Body\n');
    const callout = calloutLineAt(editor.view.state, 0);

    editor.editor.setCalloutType({ from: callout?.typeFrom ?? 0, to: callout?.typeTo ?? 0 }, 'warning');

    expect(editor.view.state.doc.toString()).toBe('> [!WARNING] Title\n> Body\n');
  });

  it('a lower-case type stays in lower case, and a stale range changes nothing', () => {
    const state = EditorState.create({ doc: '> [!tip] Title' });

    const lower = calloutTypeChange(state, { from: 4, to: 7 }, 'WARNING');
    const stale = calloutTypeChange(state, { from: 2, to: 7 }, 'warning');

    expect(lower && state.update(lower).state.doc.toString()).toBe('> [!warning] Title');
    expect(stale).toBeUndefined();
  });

  it('the type button opens the type menu for the type word', () => {
    const onOpenCalloutTypeMenu = vi.fn();
    const editor = openEditor('> [!NOTE] Title\n> Body\n\nEnd\n', { onOpenCalloutTypeMenu });
    placeCaret(editor.view, editor.view.state.doc.length);

    editor.view.contentDOM.querySelector<HTMLButtonElement>('.cm-rich-callout-type')?.click();

    expect(onOpenCalloutTypeMenu).toHaveBeenCalledWith(expect.anything(), { from: 4, to: 8 });
  });
});

describe('toggles', () => {
  afterEach(() => {
    opened?.close();
    opened = undefined;
  });

  it('a details block shows its summary as the toggle and opens without changing the text', () => {
    const text = '<details>\n<summary>Logs</summary>\n\nAll good.\n</details>\n\nEnd\n';
    const renderBlock = () => '<details><summary>Logs</summary><p>All good.</p></details>';
    const editor = openEditor(text, { richTextRendering: fakeRichTextRendering({ renderBlock }) });
    placeCaret(editor.view, text.length);

    const summary = editor.view.contentDOM.querySelector('summary');
    summary?.click();

    expect(summary?.textContent).toBe('Logs');
    expect(editor.view.state.doc.toString()).toBe(text);
  });
});
