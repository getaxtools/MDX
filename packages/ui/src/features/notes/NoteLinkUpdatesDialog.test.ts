import { createTranslator } from '@mdx/i18n';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ViewerCommand } from '../viewer/viewerCommands';
import type { NoteLinkUpdatePreview } from './NoteLinkUpdateActions';
import NoteLinkUpdatesDialog from './NoteLinkUpdatesDialog.svelte';

const PREVIEW: NoteLinkUpdatePreview = {
  noteName: 'Plan',
  linkCount: 3,
  noteCount: 2,
  notes: [
    {
      path: 'Inbox.md',
      name: 'Inbox',
      folder: '',
      lines: [
        {
          lineNumber: 3,
          before: 'See [[Draft]] and [[Draft#Goals]].',
          after: 'See [[Plan]] and [[Plan#Goals]].',
        },
      ],
    },
    {
      path: 'Projects/Work.md',
      name: 'Work',
      folder: 'Projects',
      lines: [{ lineNumber: 1, before: 'Café: [[Draft]]', after: 'Café: [[Plan]]' }],
    },
  ],
  hiddenLineCount: 0,
  leftNotes: [
    { path: 'Ideas.md', name: 'Ideas', folder: '', reason: 'unsaved' },
    { path: 'Archive/Old.md', name: 'Old', folder: 'Archive', reason: 'noUniqueTarget' },
  ],
  mayMissLinks: false,
  hasExcludedPaths: false,
};

function renderDialog(preview: NoteLinkUpdatePreview = PREVIEW) {
  const onCommand = vi.fn<(command: ViewerCommand) => void>();
  const onClose = vi.fn();
  render(NoteLinkUpdatesDialog, { preview, translator: createTranslator(), onCommand, onClose });
  return { onCommand, onClose };
}

describe('NoteLinkUpdatesDialog', () => {
  it('shows each note with its lines before and after, under the note’s name', () => {
    renderDialog();

    expect(screen.getByRole('dialog', { name: 'Update links to Plan?' })).toBeTruthy();
    const work = screen.getByRole('region', { name: 'Work in Projects' });
    expect(within(work).getByText('Line 1')).toBeTruthy();
    expect(within(work).getByText('Café: [[Draft]]')).toBeTruthy();
    expect(within(work).getByText('Café: [[Plan]]')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Inbox' })).toBeTruthy();
    expect(
      screen.getByText('3 links in 2 notes still point to the old place.', { exact: false }),
    ).toBeTruthy();
  });

  it('says which notes keep their links, why, and in which folder', () => {
    renderDialog();

    const left = screen.getByRole('region', { name: 'Left as they are' });

    expect(
      within(left)
        .getAllByRole('listitem')
        .map((item) => item.textContent.replace(/\s+/gu, ' ').trim()),
    ).toEqual([
      'Ideas, because it has unsaved changes',
      'Old, because a note of the same name would take any link written there in Archive',
    ]);
  });

  it('says when the index is still being built, when paths are excluded and how many lines are not shown', () => {
    renderDialog({ ...PREVIEW, hiddenLineCount: 12, mayMissLinks: true, hasExcludedPaths: true });

    expect(
      screen.getByText('Your notes are still being indexed, so some links may not be found yet.'),
    ).toBeTruthy();
    expect(
      screen.getByText('Notes in the paths left out of search and links keep their links as they are.'),
    ).toBeTruthy();
    expect(screen.getByText('And 12 more changed lines.')).toBeTruthy();
  });

  it('keeps the answers in the footer, outside the changes that scroll', () => {
    renderDialog();

    const changes = screen.getByRole('region', { name: 'Update links to Plan?' });

    expect(within(changes).queryByRole('button', { name: 'Update Links' })).toBeNull();
    expect(within(changes).queryByRole('checkbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Update Links' })).toBeTruthy();
  });

  it('updates the links with Always chosen, by keyboard alone', async () => {
    const { onCommand, onClose } = renderDialog();
    const always = screen.getByRole('checkbox', { name: 'Always update links without asking' });
    const update = screen.getByRole('button', { name: 'Update Links' });

    always.focus();
    await userEvent.keyboard(' ');
    await userEvent.tab();
    expect(document.activeElement).toBe(update);
    await userEvent.keyboard('{Enter}');

    expect(onCommand).toHaveBeenCalledWith({ kind: 'applyNoteLinkUpdates', isAlwaysApplied: true });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('starts on Don’t Update, and Escape leaves the links as they are', async () => {
    const { onCommand, onClose } = renderDialog();

    expect(document.activeElement).toBe(screen.getByRole('button', { name: "Don't Update" }));
    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
    expect(onCommand).not.toHaveBeenCalled();
  });
});
