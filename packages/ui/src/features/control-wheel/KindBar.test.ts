import { WorkspaceKindsState, type KindSwitcher, type WorkspaceKind } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { fireEvent, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import KindBar from './KindBar.svelte';

const NOTES_BUILT: readonly WorkspaceKind[] = [
  { id: 'markdownViewer', availability: 'built' },
  { id: 'notes', availability: 'built' },
  { id: 'specViewer', availability: 'planned' },
];

const ONLY_MARKDOWN_VIEWER_BUILT: readonly WorkspaceKind[] = [
  { id: 'markdownViewer', availability: 'built' },
  { id: 'notes', availability: 'planned' },
  { id: 'specViewer', availability: 'planned' },
];

function renderKindBar({
  registry = NOTES_BUILT,
  activeKindId = 'markdownViewer',
  kindSwitcher = 'both',
}: { registry?: readonly WorkspaceKind[]; activeKindId?: string; kindSwitcher?: KindSwitcher } = {}) {
  const onCommand = vi.fn();
  const kinds = WorkspaceKindsState.fromSaved(
    { enabledKindIds: ['markdownViewer', 'notes'], activeKindId },
    registry,
  );
  render(KindBar, { kinds, kindSwitcher, translator: createTranslator(), onCommand });
  return { onCommand };
}

const kindButton = (name: string) => screen.getByRole('button', { name });
const gear = () => screen.getByRole('button', { name: 'Choose workspace kinds' });

describe('KindBar', () => {
  it('shows one button per enabled kind with the active one pressed', () => {
    renderKindBar({ activeKindId: 'notes' });

    expect(screen.getByRole('group', { name: 'Workspace kinds' })).toBeTruthy();
    expect(kindButton('Markdown viewer').getAttribute('aria-pressed')).toBe('false');
    expect(kindButton('Notes').getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking a kind sends the switch command', async () => {
    const { onCommand } = renderKindBar();

    await userEvent.click(kindButton('Notes'));

    expect(onCommand).toHaveBeenCalledWith({ kind: 'switchWorkspaceKind', kindId: 'notes' });
  });

  it('tooltips name the kind', () => {
    renderKindBar();

    expect(kindButton('Notes').title).toBe('Notes');
  });

  it('the gear opens the kind popup and returns focus to the gear on Esc', async () => {
    const user = userEvent.setup();
    renderKindBar();

    await user.click(gear());
    expect(gear().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('dialog', { name: 'Workspace kinds' })).toBeTruthy();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'Workspace kinds' })).toBeNull();
    expect(document.activeElement).toBe(gear());
  });

  it('closes the kind popup on a press outside the bar', async () => {
    const user = userEvent.setup();
    renderKindBar();
    await user.click(gear());

    await fireEvent.pointerDown(document.body);

    expect(screen.queryByRole('dialog', { name: 'Workspace kinds' })).toBeNull();
  });

  it('is hidden when fewer than two kinds are built', () => {
    renderKindBar({ registry: ONLY_MARKDOWN_VIEWER_BUILT });

    expect(screen.queryByRole('group', { name: 'Workspace kinds' })).toBeNull();
  });

  it('is hidden when the setting is wheel only', () => {
    renderKindBar({ kindSwitcher: 'wheel' });

    expect(screen.queryByRole('group', { name: 'Workspace kinds' })).toBeNull();
  });
});
