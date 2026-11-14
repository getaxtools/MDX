import { WorkspaceKindsState, WorkspaceRegistry, workspaceKindsFor } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import type { StoredWorkspace } from '@mdx/platform';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspaceSwitcher from './WorkspaceSwitcher.svelte';

const ALL_KINDS_BUILT = workspaceKindsFor({ allowsPlannedKindPreview: true });

/** A workspace whose last-shown time is its rank: higher was used more recently. */
function stored(kindId: string, name: string | null, lastShownAtMs: number): StoredWorkspace {
  const id = (name ?? 'default').toLowerCase();
  return { id, kindId, name, icon: null, colour: null, position: 0, lastShownAtMs };
}

function renderSwitcher() {
  const onSwitch = vi.fn();
  const onClose = vi.fn();
  render(WorkspaceSwitcher, {
    source: {
      registry: WorkspaceRegistry.fromStored([
        stored('markdownViewer', null, 30),
        stored('markdownViewer', 'Handbook', 20),
        stored('markdownViewer', 'Reading', 10),
        stored('notes', 'Journal', 5),
      ]),
      shownWorkspaceId: 'default',
      kinds: WorkspaceKindsState.fromSaved(
        { enabledKindIds: ['markdownViewer', 'notes'], activeKindId: 'markdownViewer' },
        ALL_KINDS_BUILT,
      ),
    },
    translator: createTranslator(),
    onSwitch,
    onClose,
  });
  return { onSwitch, onClose, filter: screen.getByRole('combobox', { name: 'Filter workspaces' }) };
}

describe('WorkspaceSwitcher', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('opens with focus in the filter field', () => {
    const { filter } = renderSwitcher();

    expect(document.activeElement).toBe(filter);
  });

  it('announces each workspace with its name and kind, and marks the one shown', () => {
    renderSwitcher();

    const names = [
      'Default, Markdown viewer, shown now',
      'Handbook, Markdown viewer',
      'Reading, Markdown viewer',
      'Journal, Notes',
    ];

    expect(screen.getAllByRole('option')).toHaveLength(names.length);
    for (const name of names) expect(screen.getByRole('option', { name })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Notes' })).toBeTruthy();
  });

  it('typing "rea" and Enter switches to Reading', async () => {
    const { onSwitch, onClose, filter } = renderSwitcher();

    await userEvent.type(filter, 'rea{Enter}');

    expect(onClose).toHaveBeenCalled();
    expect(onSwitch).toHaveBeenCalledWith('reading');
  });

  it('arrow keys move through the groups and wrap around', async () => {
    const { onSwitch, filter } = renderSwitcher();

    await userEvent.type(filter, '{ArrowUp}{Enter}');

    expect(onSwitch).toHaveBeenCalledWith('journal');
  });

  it('choosing the workspace already shown only closes the list', async () => {
    const { onSwitch, onClose, filter } = renderSwitcher();

    await userEvent.type(filter, '{Enter}');

    expect(onClose).toHaveBeenCalled();
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it('Esc closes without switching', async () => {
    const { onSwitch, onClose, filter } = renderSwitcher();

    await userEvent.type(filter, '{Escape}');

    expect(onClose).toHaveBeenCalled();
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it('says when no workspace matches', async () => {
    const { filter } = renderSwitcher();

    await userEvent.type(filter, 'zzz');

    expect(screen.getByRole('status').textContent.trim()).toBe('No workspace matches.');
  });
});
