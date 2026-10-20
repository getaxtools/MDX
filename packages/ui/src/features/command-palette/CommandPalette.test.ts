import { createTranslator } from '@mdx/i18n';
import { InMemoryDocumentFiles } from '@mdx/platform';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import CommandPalette from './CommandPalette.svelte';
import { paletteCommands } from './paletteCommands';

const location = (path: string) => InMemoryDocumentFiles.locationOf(path);
const DOCUMENTS = [
  location('C:\\Docs\\getting-started.md'),
  location('C:\\Docs\\release-notes.md'),
  location('C:\\Notes\\notes.md'),
];

function renderPalette() {
  const translator = createTranslator();
  const onRunCommand = vi.fn();
  const onOpenDocument = vi.fn();
  const onClose = vi.fn();
  render(CommandPalette, {
    translator,
    commands: paletteCommands(translator),
    loadDocuments: () => Promise.resolve(DOCUMENTS),
    onRunCommand,
    onOpenDocument,
    onClose,
  });
  return { onRunCommand, onOpenDocument, onClose, input: screen.getByRole('combobox') };
}

const optionNames = () => screen.queryAllByRole('option').map((option) => option.textContent.trim());

describe('CommandPalette', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('lists the known documents and focuses the search box', async () => {
    const { input } = renderPalette();

    expect(await screen.findByRole('option', { name: /getting-started\.md/ })).toBeTruthy();
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeTruthy();
  });

  it('narrows the documents to those matching the typed letters, best match first', async () => {
    renderPalette();
    await screen.findAllByRole('option');

    await userEvent.keyboard('notes');

    expect(optionNames().map((name) => name.split('C:')[0]?.trim())).toEqual([
      'notes.md',
      'release-notes.md',
    ]);
  });

  it('opens the highlighted document with Enter and closes', async () => {
    const { onOpenDocument, onClose } = renderPalette();
    await screen.findAllByRole('option');

    await userEvent.keyboard('rel{Enter}');

    expect(onClose).toHaveBeenCalledOnce();
    expect(onOpenDocument).toHaveBeenCalledWith('C:\\Docs\\release-notes.md');
  });

  it('switches to commands after > and runs the chosen one', async () => {
    const { onRunCommand } = renderPalette();

    await userEvent.keyboard('>open folder');
    await userEvent.keyboard('{Enter}');

    expect(onRunCommand).toHaveBeenCalledWith({ kind: 'openFolder' });
  });

  it('moves the highlight with the arrow keys and wraps around', async () => {
    const { input } = renderPalette();
    await screen.findAllByRole('option');

    await userEvent.keyboard('{ArrowDown}');
    expect(input.getAttribute('aria-activedescendant')).toBe('palette-option-1');
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');

    expect(input.getAttribute('aria-activedescendant')).toBe('palette-option-2');
    expect(screen.getAllByRole('option')[2]?.getAttribute('aria-selected')).toBe('true');
  });

  it('marks the matched letters', async () => {
    renderPalette();
    await screen.findAllByRole('option');

    await userEvent.keyboard('gs');

    const marks = screen.getByRole('option', { name: /getting-started/ }).querySelectorAll('mark');
    expect([...marks].map((mark) => mark.textContent)).toEqual(['g', 's']);
  });

  it('says when nothing matches', async () => {
    renderPalette();
    await screen.findAllByRole('option');

    await userEvent.keyboard('zzz');

    expect(screen.getByRole('status').textContent).toBe('No matching documents.');
  });

  it('opens a clicked result', async () => {
    const { onOpenDocument } = renderPalette();

    await userEvent.click(await screen.findByRole('option', { name: /notes\.md C:\\Notes/ }));

    expect(onOpenDocument).toHaveBeenCalledWith('C:\\Notes\\notes.md');
  });

  it('closes when the user clicks outside it, but not inside it', async () => {
    const { onClose, input } = renderPalette();
    const outside = document.createElement('button');
    document.body.append(outside);

    await userEvent.click(input);
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(outside);

    expect(onClose).toHaveBeenCalled();
    outside.remove();
  });

  it('stays open when the whole window loses focus', () => {
    const { onClose, input } = renderPalette();

    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes with Escape', async () => {
    const { onClose } = renderPalette();

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledOnce();
  });
});
