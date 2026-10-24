import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSourceEditor, type SourceEditor } from './createSourceEditor';
import { EDITOR_SHORTCUTS } from './editorShortcuts';

let editor: SourceEditor | undefined;

function openEditor(text = '# Guide\n') {
  const parent = document.createElement('div');
  document.body.append(parent);
  const onChange = vi.fn();
  editor = createSourceEditor({
    parent,
    text,
    label: 'Source of Guide.md',
    phrases: { Find: 'Suchen' },
    onChange,
  });
  return { parent, onChange, editor };
}

describe('createSourceEditor', () => {
  afterEach(() => {
    editor?.destroy();
    document.body.innerHTML = '';
  });

  it('shows the text in a labelled text box', () => {
    const { parent, editor: opened } = openEditor();

    const textBox = parent.querySelector('[contenteditable="true"]');
    expect(textBox?.getAttribute('aria-label')).toBe('Source of Guide.md');
    expect(opened.text()).toBe('# Guide\n');
  });

  it('reports every change and undoes it', () => {
    const { onChange, editor: opened } = openEditor('one');

    opened.replaceText('two');
    opened.run('undo');

    expect(onChange.mock.calls).toEqual([['two'], ['one']]);
    expect(opened.text()).toBe('one');
  });

  it('continues a list when Enter is pressed at the end of an item', () => {
    const { parent, editor: opened } = openEditor('- one');
    const textBox = parent.querySelector('[contenteditable="true"]') ?? parent;

    textBox.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', ctrlKey: true, bubbles: true }));
    textBox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(opened.text()).toBe('- one\n- ');
  });

  it('formats with its own keys and leaves the app keys alone', () => {
    const { parent, editor: opened } = openEditor('word');
    const textBox = parent.querySelector('[contenteditable="true"]') ?? parent;
    textBox.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));

    const bold = new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true, cancelable: true });
    const togglePreview = new KeyboardEvent('keydown', {
      key: '/',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    textBox.dispatchEvent(bold);
    textBox.dispatchEvent(togglePreview);

    expect(opened.text()).toBe('**word**');
    expect(bold.defaultPrevented).toBe(true);
    expect(togglePreview.defaultPrevented).toBe(false);
  });

  it('leaves Alt+Left and Alt+Right to the app for going back and forward', () => {
    const { parent } = openEditor('word');
    const textBox = parent.querySelector('[contenteditable="true"]') ?? parent;

    const back = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    textBox.dispatchEvent(back);

    expect(back.defaultPrevented).toBe(false);
  });

  it('starts at the first line', () => {
    const { editor: opened } = openEditor('one\ntwo\nthree');

    opened.scrollToLine(0);

    expect(opened.topLine()).toBe(0);
  });

  it('puts the caret at the start of a line it reveals, such as a heading chosen in the outline', () => {
    const { parent, editor: opened } = openEditor('# Guide\n\ntext\n\n## Usage\n');
    const textBox = parent.querySelector('[contenteditable="true"]') ?? parent;

    opened.revealLine(4);
    textBox.dispatchEvent(new KeyboardEvent('keydown', { key: '2', ctrlKey: true, bubbles: true }));

    expect(opened.text()).toBe('# Guide\n\ntext\n\nUsage\n');
    expect(parent.contains(document.activeElement)).toBe(true);
  });

  it('opens the search panel in the user language', () => {
    const { parent, editor: opened } = openEditor();

    opened.run('find');

    expect(parent.querySelector('.cm-search')).not.toBeNull();
    expect(parent.querySelector<HTMLInputElement>('input[name="search"]')?.placeholder).toBe('Suchen');
  });

  it('opens the search panel with the replace box focused for Replace', () => {
    const { parent, editor: opened } = openEditor();

    opened.run('replace');

    expect(document.activeElement).toBe(parent.querySelector('input[name="replace"]'));
  });
});

describe('EDITOR_SHORTCUTS', () => {
  it('gives every formatting action its own key', () => {
    const keys = EDITOR_SHORTCUTS.map((shortcut) => shortcut.key);

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('Mod-b');
    expect(keys).not.toContain('Mod-/');
  });
});
