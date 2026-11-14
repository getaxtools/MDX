import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ViewerCommand } from '../viewer/viewerCommands';
import NotesLocationMissing from './NotesLocationMissing.svelte';

function renderPanel() {
  const onCommand = vi.fn<(command: ViewerCommand) => void>();
  render(NotesLocationMissing, { path: 'E:\\Notes\\Journal', translator: createTranslator(), onCommand });
  return { onCommand };
}

describe('NotesLocationMissing', () => {
  it('names the missing folder and says no folder was created', () => {
    renderPanel();

    const panel = screen.getByRole('main', { name: 'Your notes folder is not available' });

    expect(panel.textContent).toContain('MDX cannot find E:\\Notes\\Journal.');
    expect(panel.textContent).toContain('MDX did not create a new folder there.');
  });

  it('offers Try Again, Locate Folder and Choose Another Folder in that order', () => {
    renderPanel();

    expect(screen.getAllByRole('button').map((button) => button.textContent.trim())).toEqual([
      'Try Again',
      'Locate Folder…',
      'Choose Another Folder…',
    ]);
  });

  it('runs each action from the keyboard', async () => {
    const { onCommand } = renderPanel();

    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    await userEvent.tab();
    await userEvent.keyboard(' ');

    expect(onCommand.mock.calls.map(([command]) => command.kind)).toEqual([
      'retryNotesLocation',
      'locateNotesLocation',
      'chooseNotesLocation',
    ]);
  });
});
