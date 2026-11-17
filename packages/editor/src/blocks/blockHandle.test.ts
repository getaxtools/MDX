import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openRichTextEditor, placeCaret, type TestEditor } from '../rich-text/richTextTestEditor';

const THREE_PARAGRAPHS = 'Alpha one\n\nRelease notes for 2026\n\nCharlie three\n';

/** jsdom has no pointer events; a mouse event with a pointer id is what the handle reads. */
class TestPointerEvent extends MouseEvent {
  readonly pointerId = 1;
}

let opened: TestEditor | undefined;

function openEditor(text: string, options: Parameters<typeof openRichTextEditor>[1] = {}): TestEditor {
  opened = openRichTextEditor(text, options);
  opened.view.scrollDOM.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
  return opened;
}

function handleOf(editor: TestEditor): HTMLButtonElement {
  const handle = editor.view.scrollDOM.querySelector<HTMLButtonElement>('.cm-block-handle');
  if (!handle) throw new Error('No block handle');
  return handle;
}

function pointer(handle: HTMLElement, type: string, at: { clientY: number; clientX?: number }): void {
  const clientX = at.clientX ?? 10;
  handle.dispatchEvent(
    new TestPointerEvent(type, { bubbles: true, cancelable: true, button: 0, clientX, clientY: at.clientY }),
  );
}

/** Drags the handle of the block at a position to a height on screen. */
function dragHandle(
  editor: TestEditor,
  { from, toY, releaseX = 10 }: { from: number; toY: number; releaseX?: number },
): HTMLButtonElement {
  placeCaret(editor.view, from);
  const handle = handleOf(editor);
  pointer(handle, 'pointerdown', { clientY: 0 });
  pointer(handle, 'pointermove', { clientY: toY });
  pointer(handle, 'pointerup', { clientY: toY, clientX: releaseX });
  return handle;
}

describe('the block handle', () => {
  beforeEach(() => {
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
  });

  afterEach(() => {
    opened?.close();
    opened = undefined;
  });

  it('accessible name contains kind and first words', () => {
    const editor = openEditor(THREE_PARAGRAPHS);

    placeCaret(editor.view, THREE_PARAGRAPHS.indexOf('notes'));

    expect(handleOf(editor).getAttribute('aria-label')).toBe(
      'Actions for the paragraph starting “Release notes for 2026”',
    );
  });

  it('handle follows the caret block', () => {
    const editor = openEditor('# Results\n\n- [ ] Ship the release\n');

    placeCaret(editor.view, 2);
    const onHeading = handleOf(editor).getAttribute('aria-label');
    placeCaret(editor.view, editor.view.state.doc.length - 2);
    const onTask = handleOf(editor).getAttribute('aria-label');

    expect(onHeading).toBe('Actions for the heading starting “Results”');
    expect(onTask).toBe('Actions for the list item starting “Ship the release”');
  });

  it('the editor keeps one Tab stop', () => {
    const editor = openEditor(THREE_PARAGRAPHS);

    const tabStops = [...editor.view.dom.querySelectorAll<HTMLElement>('button, [tabindex]')].filter(
      (element) => element.tabIndex >= 0,
    );

    expect(handleOf(editor).tabIndex).toBe(-1);
    expect(tabStops).toEqual([editor.view.contentDOM]);
  });

  it('drag below the last block', () => {
    const editor = openEditor(THREE_PARAGRAPHS);

    dragHandle(editor, { from: 0, toY: 590 });

    expect(editor.view.state.doc.toString()).toBe('Release notes for 2026\n\nCharlie three\n\nAlpha one\n');
  });

  it('undo restores the order', () => {
    const editor = openEditor(THREE_PARAGRAPHS);
    dragHandle(editor, { from: 0, toY: 590 });

    editor.editor.run('undo');

    expect(editor.view.state.doc.toString()).toBe(THREE_PARAGRAPHS);
  });

  it('Escape cancels', () => {
    const editor = openEditor(THREE_PARAGRAPHS);
    placeCaret(editor.view, 0);
    const handle = handleOf(editor);

    pointer(handle, 'pointerdown', { clientY: 0 });
    pointer(handle, 'pointermove', { clientY: 590 });
    const isLineShown = !editor.view.scrollDOM.querySelector<HTMLElement>('.cm-block-drop-line')?.hidden;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    pointer(handle, 'pointerup', { clientY: 590 });

    expect(isLineShown).toBe(true);
    expect(editor.view.state.doc.toString()).toBe(THREE_PARAGRAPHS);
  });

  it('releasing outside the editor cancels', () => {
    const editor = openEditor(THREE_PARAGRAPHS);

    dragHandle(editor, { from: 0, toY: 590, releaseX: 1200 });

    expect(editor.view.state.doc.toString()).toBe(THREE_PARAGRAPHS);
  });

  it('a click opens the block menu for the handle block', () => {
    const onOpenBlockMenu = vi.fn();
    const editor = openEditor(THREE_PARAGRAPHS, { onOpenBlockMenu });
    placeCaret(editor.view, 0);
    const handle = handleOf(editor);

    pointer(handle, 'pointerdown', { clientY: 0 });
    pointer(handle, 'pointerup', { clientY: 0 });
    handle.click();

    expect(onOpenBlockMenu).toHaveBeenCalledOnce();
    expect(editor.view.state.doc.toString()).toBe(THREE_PARAGRAPHS);
  });

  it('Source shows no handle', () => {
    const editor = openEditor(THREE_PARAGRAPHS);

    editor.editor.setEditingMode('source');

    expect(editor.view.scrollDOM.querySelector('.cm-block-handle')).toBeNull();
  });
});
