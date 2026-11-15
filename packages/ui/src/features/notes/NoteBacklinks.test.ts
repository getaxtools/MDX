import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import NoteBacklinks from './NoteBacklinks.svelte';
import type { NotesLinkCommand } from './NotesIndexActions';

describe('NoteBacklinks', () => {
  it('entries show note and line', async () => {
    const onCommand = vi.fn<(command: NotesLinkCommand) => void>();
    render(NoteBacklinks, {
      backlinks: [{ path: 'Projects/Inbox.md', lineNumber: 3, line: 'Read the [[plan]] today.' }],
      noteName: 'Plan',
      translator: createTranslator(),
      onCommand,
    });

    const entry = screen.getByRole('button', { name: /Inbox/ });
    await userEvent.click(entry);

    expect(screen.getByRole('heading', { name: 'Linked from 1 note' })).toBeTruthy();
    expect(entry.textContent).toContain('Read the [[plan]] today.');
    expect(entry.textContent).toContain('Line 3');
    expect(onCommand).toHaveBeenCalledWith({
      kind: 'openBacklink',
      path: 'Projects/Inbox.md',
      noteName: 'Plan',
    });
  });

  it('says when no other note links here', () => {
    render(NoteBacklinks, {
      backlinks: [],
      noteName: 'Plan',
      translator: createTranslator(),
      onCommand: vi.fn(),
    });

    expect(screen.getByText('No other note links here yet.')).toBeTruthy();
  });
});
