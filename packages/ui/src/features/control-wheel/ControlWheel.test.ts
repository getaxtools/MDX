import { WorkspaceKindsState, type WorkspaceKind } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { fireEvent, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ControlWheel from './ControlWheel.svelte';

const ALL_KINDS_BUILT: readonly WorkspaceKind[] = [
  { id: 'markdownViewer', availability: 'built' },
  { id: 'notes', availability: 'built' },
  { id: 'specViewer', availability: 'built' },
];

function renderWheel(
  enabledKindIds = ['markdownViewer', 'notes', 'specViewer'],
  activeKindId = 'markdownViewer',
) {
  const onCommand = vi.fn();
  const onClose = vi.fn();
  const kinds = WorkspaceKindsState.fromSaved({ enabledKindIds, activeKindId }, ALL_KINDS_BUILT);
  const rendered = render(ControlWheel, {
    kinds,
    dock: 'bottomInlineEnd',
    translator: createTranslator(),
    onCommand,
    onClose,
  });
  return { ...rendered, onCommand, onClose };
}

const segment = (name: string) => screen.getByRole('menuitemradio', { name });

describe('ControlWheel', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows one checkable item per enabled kind, in order, with the active one checked', () => {
    renderWheel(['markdownViewer', 'notes', 'specViewer'], 'notes');

    const items = screen.getAllByRole('menuitemradio');

    expect(items.map((item) => item.getAttribute('aria-label'))).toEqual([
      'Markdown viewer',
      'Notes',
      'Spec viewer',
    ]);
    expect(items.map((item) => item.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
  });

  it('names the wheel, its menu and its gear for assistive technology', () => {
    renderWheel();

    expect(screen.getByRole('dialog', { name: 'Control wheel' })).toBeTruthy();
    expect(screen.getByRole('menu', { name: 'Workspace kinds' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose workspace kinds' }).getAttribute('aria-expanded')).toBe(
      'false',
    );
  });

  it('focuses the active kind when it opens', () => {
    renderWheel(['markdownViewer', 'notes'], 'notes');

    expect(document.activeElement).toBe(segment('Notes'));
  });

  it('moves the focus round the ring with the arrow keys', async () => {
    const user = userEvent.setup();
    renderWheel();

    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(segment('Notes'));
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(document.activeElement).toBe(segment('Spec viewer'));
  });

  it('chooses a kind by its number and closes', async () => {
    const user = userEvent.setup();
    const { onCommand, onClose } = renderWheel();

    await user.keyboard('2');

    expect(onCommand).toHaveBeenCalledWith({ kind: 'switchWorkspaceKind', kindId: 'notes' });
    expect(onClose).toHaveBeenCalled();
  });

  it('chooses the focused kind with Space and stays open', async () => {
    const user = userEvent.setup();
    const { onCommand, onClose } = renderWheel();

    await user.keyboard('{ArrowDown} ');

    expect(onCommand).toHaveBeenCalledWith({ kind: 'switchWorkspaceKind', kindId: 'notes' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('moves between the ring and the gear with Tab', async () => {
    const user = userEvent.setup();
    renderWheel();

    await user.keyboard('{Tab}');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Choose workspace kinds' }));
    await user.keyboard('{Tab}');
    expect(document.activeElement).toBe(segment('Markdown viewer'));
  });

  it('closes with Esc and gives the focus back to what had it before', async () => {
    const user = userEvent.setup();
    const editor = document.createElement('button');
    document.body.append(editor);
    editor.focus();
    const { onClose, unmount } = renderWheel();

    await user.keyboard('{Escape}');
    unmount();

    expect(onClose).toHaveBeenCalled();
    expect(document.activeElement).toBe(editor);
  });

  it('chooses a kind clicked inside its sector, away from its icon', async () => {
    const { onCommand, onClose } = renderWheel(['markdownViewer', 'notes']);
    const menu = screen.getByRole('menu', { name: 'Workspace kinds' });
    vi.spyOn(menu, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 200));

    await fireEvent.click(menu, { clientX: 100, clientY: 195 });

    expect(onCommand).toHaveBeenCalledWith({ kind: 'switchWorkspaceKind', kindId: 'notes' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes without a change when the user presses outside it', async () => {
    const { onCommand, onClose } = renderWheel();

    await fireEvent.pointerDown(document.body);

    expect(onClose).toHaveBeenCalled();
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('shows the focused kind and its number in the caption', async () => {
    const user = userEvent.setup();
    renderWheel();

    await user.keyboard('{ArrowDown}');

    expect(screen.getByText('Notes - 2')).toBeTruthy();
  });

  it('gives each segment a tooltip with its name and number', () => {
    renderWheel();

    expect(segment('Spec viewer').getAttribute('title')).toBe('Spec viewer (3)');
    expect(segment('Spec viewer').getAttribute('aria-keyshortcuts')).toBe('3');
  });

  describe('gear', () => {
    it('opens the kind choices and shows that it is expanded', async () => {
      const user = userEvent.setup();
      renderWheel();
      const gear = screen.getByRole('button', { name: 'Choose workspace kinds' });

      await user.click(gear);

      expect(gear.getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByRole('dialog', { name: 'Workspace kinds' })).toBeTruthy();
    });

    it('closes the kind choices with Esc and puts the focus back on the gear', async () => {
      const user = userEvent.setup();
      const { onClose } = renderWheel();
      const gear = screen.getByRole('button', { name: 'Choose workspace kinds' });
      await user.click(gear);

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('dialog', { name: 'Workspace kinds' })).toBeNull();
      expect(document.activeElement).toBe(gear);
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
