import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { parseWholeDocument } from './parseWholeDocument';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSourceEditor, type SourceEditor } from '../createSourceEditor';

let editor: SourceEditor | undefined;

function openRichText(text: string) {
  const parent = document.createElement('div');
  document.body.append(parent);
  editor = createSourceEditor({
    parent,
    text,
    label: 'Source',
    phrases: {},
    onChange: vi.fn(),
    editingMode: 'richText',
  });
  const view = EditorView.findFromDOM(parent.querySelector<HTMLElement>('.cm-editor') ?? parent);
  if (!view) throw new Error('The editor view was not created');
  parseWholeDocument(view);
  return view;
}

function firstLine(view: EditorView): string | null | undefined {
  return view.contentDOM.querySelector('.cm-line')?.textContent;
}

function startComposition(view: EditorView): void {
  view.contentDOM.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
}

function endComposition(view: EditorView, data: string): void {
  view.contentDOM.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data }));
}

/** What CodeMirror dispatches for each step of a composition, as it reads the input method's text. */
function compose(view: EditorView, from: number, steps: readonly string[]): void {
  let composedLength = 0;
  for (const composed of steps) {
    view.dispatch({
      changes: { from, to: from + composedLength, insert: composed },
      selection: EditorSelection.cursor(from + composed.length),
      userEvent: 'input.type.compose',
    });
    composedLength = composed.length;
  }
}

async function nextTask(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('Rich text during input method composition', () => {
  afterEach(() => {
    editor?.destroy();
    editor = undefined;
    document.body.innerHTML = '';
  });

  it('no decoration change while composing', () => {
    const view = openRichText('Use **ready** here\n\nAnother paragraph');
    view.dispatch({ selection: EditorSelection.cursor(view.state.doc.length) });
    const shownBefore = firstLine(view);

    startComposition(view);
    view.dispatch({ selection: EditorSelection.cursor('Use **re'.length) });
    compose(view, 'Use **re'.length, ['か', 'かな']);

    expect(shownBefore).toBe('Use ready here');
    expect(firstLine(view)).toBe('Use reかなady here');
  });

  it('pending reveal applied after composition ends', async () => {
    const view = openRichText('Use **ready** here\n\nAnother paragraph');
    view.dispatch({ selection: EditorSelection.cursor(view.state.doc.length) });

    startComposition(view);
    view.dispatch({ selection: EditorSelection.cursor('Use **re'.length) });
    const shownWhileComposing = firstLine(view);
    endComposition(view, '');
    await nextTask();

    expect(shownWhileComposing).toBe('Use ready here');
    expect(firstLine(view)).toBe('Use **ready** here');
  });

  it('composition next to hidden markers commits once', async () => {
    const view = openRichText('A **bold** word\n\nAnother paragraph');
    const afterBold = 'A **bold**'.length;
    view.dispatch({ selection: EditorSelection.cursor(afterBold) });
    const shownAtStart = firstLine(view);

    startComposition(view);
    compose(view, afterBold, ['に', 'にほ']);
    const shownWhileComposing = firstLine(view);
    endComposition(view, 'にほ');
    await nextTask();

    expect(shownAtStart).toBe('A **bold** word');
    expect(shownWhileComposing).toBe('A **bold**にほ word');
    expect(view.state.doc.line(1).text).toBe('A **bold**にほ word');
    expect(firstLine(view)).toBe('A boldにほ word');
  });
});
