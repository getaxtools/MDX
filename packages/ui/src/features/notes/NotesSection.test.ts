import { createTranslator } from '@mdx/i18n';
import { InMemoryNoteFiles } from '@mdx/platform';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { NotesCommand } from './NotesActions';
import NotesSection from './NotesSection.svelte';

const JOURNAL = 'E:\\Journal';

function renderTree({ isDeletionConfirmed = true } = {}) {
  const noteFiles = new InMemoryNoteFiles({
    folders: ['E:\\Journal\\Projects', 'E:\\Journal\\Daily'],
    notes: ['E:\\Journal\\Projects.md', 'E:\\Journal\\Projects\\Plan.md', 'E:\\Journal\\Inbox.md'],
  });
  const onCommand = vi.fn<(command: NotesCommand | { kind: string }) => void>();
  const onOpenDocument = vi.fn<(path: string) => void>();
  render(NotesSection, {
    locationPath: JOURNAL,
    revision: 0,
    isDeletionConfirmed,
    translator: createTranslator(),
    isExpanded: true,
    onToggleExpanded: vi.fn(),
    folderRevisions: new Map(),
    onListFolder: (path: string) => noteFiles.listFolder(path),
    onShowFolder: () => () => undefined,
    onOpenDocument,
    onCommand,
  });
  const row = (name: string) => screen.findByRole('treeitem', { name });
  return { onCommand, onOpenDocument, row };
}

describe('NotesSection', () => {
  it('lists folders first, then notes, with a note and its folder as one row', async () => {
    const { row } = renderTree();
    await row('Inbox');

    const tree = screen.getByRole('tree', { name: 'Notes' });

    expect(
      [...tree.querySelectorAll('[role="treeitem"][aria-level="1"]')].map((item) => item.textContent.trim()),
    ).toEqual(['Daily', 'Projects', 'Inbox']);
  });

  it('folder rows expose aria-expanded, plain notes do not', async () => {
    const { row } = renderTree();

    expect((await row('Projects')).getAttribute('aria-expanded')).toBe('false');
    expect((await row('Daily')).getAttribute('aria-expanded')).toBe('false');
    expect((await row('Inbox')).hasAttribute('aria-expanded')).toBe(false);
  });

  it('arrow keys and Enter: Right shows a note’s child notes and Enter opens the note', async () => {
    const { row, onOpenDocument } = renderTree();
    (await row('Projects')).focus();

    await userEvent.keyboard('{ArrowRight}');
    await row('Plan');
    await userEvent.keyboard('{Enter}');

    expect((await row('Projects')).getAttribute('aria-expanded')).toBe('true');
    expect(onOpenDocument).toHaveBeenCalledWith('E:\\Journal\\Projects.md');
  });

  it('F2 renames a note in place', async () => {
    const { row, onCommand } = renderTree();
    (await row('Inbox')).focus();

    await userEvent.keyboard('{F2}');
    const input = screen.getByRole('textbox', { name: 'New name for Inbox' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Ideas{Enter}');

    expect(onCommand).toHaveBeenCalledWith({
      kind: 'renameNote',
      note: expect.objectContaining({ displayPath: 'E:\\Journal\\Inbox.md' }) as unknown,
      name: 'Ideas',
    });
  });

  it('Escape leaves a rename without renaming', async () => {
    const { row, onCommand } = renderTree();
    (await row('Inbox')).focus();

    await userEvent.keyboard('{F2}');
    await userEvent.type(screen.getByRole('textbox', { name: 'New name for Inbox' }), 'x{Escape}');

    expect(onCommand).not.toHaveBeenCalled();
  });

  it('Ctrl+X on a note and Ctrl+V on a folder moves the note into it', async () => {
    const { row, onCommand } = renderTree();
    (await row('Inbox')).focus();

    await userEvent.keyboard('{Control>}x{/Control}');
    expect(screen.getByText(/Inbox is cut/)).toBeTruthy();
    (await row('Daily')).focus();
    await userEvent.keyboard('{Control>}v{/Control}');

    expect(onCommand).toHaveBeenCalledWith({
      kind: 'moveNote',
      note: expect.objectContaining({ displayPath: 'E:\\Journal\\Inbox.md' }) as unknown,
      into: 'E:\\Journal\\Daily',
    });
  });

  it('New Note asks for a name and creates the note in the location', async () => {
    const { onCommand } = renderTree();

    await userEvent.click(screen.getByRole('button', { name: 'New Note' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Name of the new note' }), 'Today{Enter}');

    expect(onCommand).toHaveBeenCalledWith({ kind: 'createNote', parent: JOURNAL, name: 'Today' });
  });

  it('the menu of a note offers a child note, rename, cut and paste', async () => {
    const { row, onCommand } = renderTree();
    (await row('Projects')).focus();

    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    const items = screen.getAllByRole('menuitem').map((item) => item.firstElementChild?.textContent);
    await userEvent.click(screen.getByRole('menuitem', { name: /New Child Note/ }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Name of the new note' }), 'Budget{Enter}');

    expect(items).toEqual([
      'New Child Note',
      'Rename',
      'Cut',
      'Paste Here',
      'Paste as Child Note',
      'Export…',
      'Export as HTML…',
      'Print or Save as PDF…',
      'Copy Path',
      'Reveal in File Explorer',
      'Move to Trash',
    ]);
    expect(onCommand).toHaveBeenCalledWith({
      kind: 'createNote',
      parent: 'E:\\Journal\\Projects.md',
      name: 'Budget',
    });
  });
  it('exports a folder or a note from its menu, and prints a note through the app', async () => {
    const { row, onCommand } = renderTree();
    (await row('Daily')).focus();
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    await userEvent.click(screen.getByRole('menuitem', { name: /^Export…/ }));
    (await row('Inbox')).focus();
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    await userEvent.click(screen.getByRole('menuitem', { name: /Print or Save as PDF/ }));

    expect(onCommand.mock.calls.map(([command]) => command)).toEqual([
      { kind: 'showNotesExport', notes: { kind: 'folder', path: 'E:\\Journal\\Daily' }, name: 'Daily' },
      {
        kind: 'printNote',
        note: expect.objectContaining({ displayPath: 'E:\\Journal\\Inbox.md' }) as unknown,
      },
    ]);
  });

  it('Delete asks first and moves the note and its child notes to the trash', async () => {
    const { row, onCommand } = renderTree();
    (await row('Projects')).focus();

    await userEvent.keyboard('{Delete}');
    const question = screen.getByRole('alertdialog', { name: 'Move Projects to the trash?' });
    expect(question.textContent).toContain('Its child notes go to the trash with it.');
    await userEvent.click(screen.getByRole('button', { name: 'Move to Trash' }));

    expect(onCommand).toHaveBeenCalledWith({
      kind: 'deleteNote',
      note: expect.objectContaining({ displayPath: 'E:\\Journal\\Projects.md' }) as unknown,
    });
  });

  it('cancelling the question keeps the note', async () => {
    const { row, onCommand } = renderTree();
    (await row('Inbox')).focus();

    await userEvent.keyboard('{Delete}');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCommand).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('deletes without asking when the setting is off', async () => {
    const { row, onCommand } = renderTree({ isDeletionConfirmed: false });
    (await row('Inbox')).focus();

    await userEvent.keyboard('{Delete}');

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onCommand).toHaveBeenCalledWith({
      kind: 'deleteNote',
      note: expect.objectContaining({ displayPath: 'E:\\Journal\\Inbox.md' }) as unknown,
    });
  });

  it('Show Trash opens the trash view', async () => {
    const { onCommand } = renderTree();

    await userEvent.click(screen.getByRole('button', { name: 'Show Trash' }));

    expect(onCommand).toHaveBeenCalledWith({ kind: 'showNoteTrash' });
  });
});
