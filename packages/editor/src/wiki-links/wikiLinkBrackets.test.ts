import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openRichTextEditor, placeCaret, shownLines, type TestEditor } from '../rich-text/richTextTestEditor';
import type { WikiLinkSuggester } from './wikiLinkCompletions';

const NO_SUGGESTIONS: WikiLinkSuggester = {
  notes: () => Promise.resolve([]),
  headings: () => Promise.resolve([]),
};
const NOTE = 'See [[Setup#Install]] and [[Plan|the plan]].\n\nEnd.';

let opened: TestEditor | undefined;

function openNote(text: string, options: { isInNotesWorkspace?: boolean } = {}): TestEditor {
  opened = openRichTextEditor(
    text,
    options.isInNotesWorkspace === false ? {} : { wikiLinks: NO_SUGGESTIONS },
  );
  return opened;
}

function firstLine(view: EditorView): string | undefined {
  return shownLines(view)[0];
}

function compose(view: EditorView, at: number, composed: string): void {
  view.dispatch({
    changes: { from: at, insert: composed },
    selection: EditorSelection.cursor(at + composed.length),
    userEvent: 'input.type.compose',
  });
}

describe('wiki-links in Rich text', () => {
  afterEach(() => {
    opened?.close();
    opened = undefined;
  });

  it('brackets hidden away from the caret', () => {
    const { view } = openNote(NOTE);

    expect(firstLine(view)).toBe('See Setup#Install and Plan|the plan.');
    expect(
      [...view.contentDOM.querySelectorAll('.cm-rich-wiki-link')].map((link) => link.textContent),
    ).toEqual(['Setup#Install', 'Plan|the plan']);
  });

  it('brackets shown when the caret is inside', () => {
    const { view } = openNote(NOTE);

    placeCaret(view, NOTE.indexOf('Install'));
    const shownInside = firstLine(view);
    placeCaret(view, NOTE.indexOf(' and'));
    const shownAtTheEdge = firstLine(view);

    expect(shownInside).toBe('See [[Setup#Install]] and Plan|the plan.');
    expect(shownAtTheEdge).toBe('See [[Setup#Install]] and Plan|the plan.');
  });

  it('saved text is unchanged', () => {
    const { editor, view, onChange } = openNote(NOTE);

    for (let position = 0; position <= NOTE.length; position += 1) placeCaret(view, position);

    expect(editor.text()).toBe(NOTE);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('code, math and escaped brackets are not wiki-links', () => {
    const { view } = openNote('`[[a]]` and $[[b]]$ and \\[[c]] and [[ ]]\n\nEnd.');

    expect(view.contentDOM.querySelectorAll('.cm-rich-wiki-link')).toHaveLength(0);
  });

  it('only a note of a Notes workspace hides the brackets', () => {
    const { view } = openNote(NOTE, { isInNotesWorkspace: false });

    expect(firstLine(view)).toBe('See [[Setup#Install]] and [[Plan|the plan]].');
  });

  it('Source shows the brackets', () => {
    const { editor, view } = openNote(NOTE);

    editor.setEditingMode('source');

    expect(firstLine(view)).toBe('See [[Setup#Install]] and [[Plan|the plan]].');
  });

  it('no bracket is revealed or hidden while an input method composes, and the reveal follows its end', async () => {
    const { view } = openNote(NOTE);
    const insideSetup = NOTE.indexOf('Setup') + 2;

    view.contentDOM.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    placeCaret(view, insideSetup);
    compose(view, insideSetup, 'か');
    const shownWhileComposing = firstLine(view);
    view.contentDOM.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'か' }));
    await vi.waitFor(() => expect(firstLine(view)).toBe('See [[Seかtup#Install]] and Plan|the plan.'));

    expect(shownWhileComposing).toBe('See Seかtup#Install and Plan|the plan.');
  });
});
