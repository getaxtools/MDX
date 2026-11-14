import { WorkspaceKindsState, type WorkspaceKind } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import KindSettingsPopup from './KindSettingsPopup.svelte';

const NOTES_BUILT_SPEC_VIEWER_PLANNED: readonly WorkspaceKind[] = [
  { id: 'markdownViewer', availability: 'built' },
  { id: 'notes', availability: 'built' },
  { id: 'specViewer', availability: 'planned' },
];

function renderPopup(enabledKindIds: string[]) {
  const onCommand = vi.fn();
  const onClose = vi.fn();
  const kinds = WorkspaceKindsState.fromSaved(
    { enabledKindIds, activeKindId: enabledKindIds[0] },
    NOTES_BUILT_SPEC_VIEWER_PLANNED,
  );
  render(KindSettingsPopup, { kinds, translator: createTranslator(), onCommand, onClose });
  return { onCommand, onClose };
}

const kindSwitch = (name: string) => screen.getByRole('switch', { name: new RegExp(`^${name}`) });

describe('KindSettingsPopup', () => {
  it('lists every kind with an on or off switch', () => {
    renderPopup(['markdownViewer']);

    expect(screen.getAllByRole('switch')).toHaveLength(3);
    expect(kindSwitch('Markdown viewer').getAttribute('aria-checked')).toBe('true');
    expect(kindSwitch('Notes').getAttribute('aria-checked')).toBe('false');
  });

  it('marks planned kinds unavailable and says they come later', () => {
    renderPopup(['markdownViewer']);

    expect(kindSwitch('Spec viewer').getAttribute('aria-disabled')).toBe('true');
    expect(kindSwitch('Spec viewer').textContent).toContain('Later');
  });

  it('marks the last enabled kind unavailable and says why', () => {
    renderPopup(['markdownViewer']);

    const lastKind = kindSwitch('Markdown viewer');

    expect(lastKind.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById(lastKind.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'At least one kind stays on.',
    );
  });

  it('sends a command when a kind is turned off', async () => {
    const user = userEvent.setup();
    const { onCommand } = renderPopup(['markdownViewer', 'notes']);

    await user.click(kindSwitch('Notes'));

    expect(onCommand).toHaveBeenCalledWith({
      kind: 'setWorkspaceKindEnabled',
      kindId: 'notes',
      isEnabled: false,
    });
  });

  it('sends nothing for an unavailable kind', async () => {
    const user = userEvent.setup();
    const { onCommand } = renderPopup(['markdownViewer']);

    await user.click(kindSwitch('Spec viewer'));
    await user.click(kindSwitch('Markdown viewer'));

    expect(onCommand).not.toHaveBeenCalled();
  });

  it('focuses the first switch when it opens and closes with Esc', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPopup(['markdownViewer']);

    expect(document.activeElement).toBe(kindSwitch('Markdown viewer'));
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });
});
