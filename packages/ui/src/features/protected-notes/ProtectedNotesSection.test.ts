import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ViewerCommand } from '../viewer/viewerCommands';
import type { ProtectedNotesView } from './ProtectedNotesActions';
import ProtectedNotesSection from './ProtectedNotesSection.svelte';

const NOT_SET_UP: ProtectedNotesView = {
  state: 'notSetUp',
  canUnlockOnThisPc: false,
  notes: [],
  isBusy: false,
};
const UNLOCKED_EMPTY: ProtectedNotesView = { ...NOT_SET_UP, state: 'unlocked' };

function renderSection(view: ProtectedNotesView) {
  const onCommand = vi.fn<(command: ViewerCommand) => void>();
  render(ProtectedNotesSection, {
    view,
    translator: createTranslator(),
    isExpanded: true,
    onToggleExpanded: vi.fn(),
    onCommand,
  });
  return { onCommand };
}

describe('ProtectedNotesSection', () => {
  it('offers to protect notes when the workspace has no section', async () => {
    const { onCommand } = renderSection(NOT_SET_UP);

    await userEvent.click(screen.getByRole('button', { name: 'Protect Notes…' }));

    expect(onCommand).toHaveBeenCalledWith({ kind: 'showProtectedSetUp' });
  });

  it('names an unlocked section as unlocked in its heading', () => {
    renderSection(UNLOCKED_EMPTY);

    expect(screen.getByRole('heading', { name: 'Protected notes Unlocked' })).toBeTruthy();
    expect(screen.getByText('No protected notes yet.')).toBeTruthy();
  });

  it('names a locked section as locked, and lists nothing', () => {
    renderSection({ ...NOT_SET_UP, state: 'locked' });

    expect(screen.getByRole('heading', { name: 'Protected notes Locked' })).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
