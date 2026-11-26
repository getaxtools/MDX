import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { NotesLinkCommand } from './NotesIndexActions';
import NoteTagsSection from './NoteTagsSection.svelte';

function renderTags(
  tags = [
    { tag: 'work', notes: 2 },
    { tag: 'work/finance', notes: 1 },
    { tag: 'home', notes: 1 },
  ],
) {
  const onCommand = vi.fn<(command: NotesLinkCommand) => void>();
  render(NoteTagsSection, {
    tags,
    translator: createTranslator(),
    isExpanded: true,
    onToggleExpanded: vi.fn(),
    onCommand,
  });
  return { onCommand };
}

describe('NoteTagsSection', () => {
  it('nested tags with counts', async () => {
    renderTags();
    const work = screen.getByRole('treeitem', { name: 'work, 2 notes' });
    expect(work.getAttribute('aria-expanded')).toBe('false');
    work.focus();

    await userEvent.keyboard('{ArrowRight}');

    expect(screen.getByRole('treeitem', { name: 'finance, 1 note' }).getAttribute('aria-level')).toBe('2');
    expect(screen.getByRole('treeitem', { name: 'home, 1 note' })).toBeTruthy();
  });

  it('choosing a tag asks for its notes', async () => {
    const { onCommand } = renderTags();

    screen.getByRole('treeitem', { name: 'home, 1 note' }).focus();
    await userEvent.keyboard('{Enter}');

    expect(onCommand).toHaveBeenCalledWith({ kind: 'showNotesWithTag', tag: 'home' });
  });

  it('says how to add a tag when there are none', () => {
    renderTags([]);

    expect(screen.getByText('No tags yet. Type #name in a note to tag it.')).toBeTruthy();
  });
});
