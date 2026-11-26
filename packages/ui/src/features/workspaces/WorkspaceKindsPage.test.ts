import { WORKSPACE_KINDS, WorkspaceKindsState, type WorkspaceKind } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import WorkspaceKindsPage from './WorkspaceKindsPage.svelte';

const ALL_KINDS_ON = WorkspaceKindsState.fromSaved({
  enabledKindIds: ['markdownViewer', 'notes', 'specViewer'],
  activeKindId: 'markdownViewer',
});
const SPEC_VIEWER_OFF = WorkspaceKindsState.fromSaved({
  enabledKindIds: ['markdownViewer', 'notes'],
  activeKindId: 'markdownViewer',
});
const NOTES_OFF = WorkspaceKindsState.fromSaved({
  enabledKindIds: ['markdownViewer', 'specViewer'],
  activeKindId: 'markdownViewer',
});

/** `null` renders the page for a control wheel with no shortcut. */
function renderPage(kinds: WorkspaceKindsState, shortcut: string | null = 'Ctrl+Space') {
  const onCommand = vi.fn();
  const onClose = vi.fn();
  const { rerender } = render(WorkspaceKindsPage, {
    kinds,
    controlWheelShortcut: shortcut ?? undefined,
    translator: createTranslator(),
    onCommand,
    onClose,
  });
  return { onCommand, onClose, rerender };
}

function cardOf(kindName: string): HTMLElement {
  return screen.getByRole('listitem', { name: kindName });
}

function announcement(): string {
  return screen.getByRole('status').textContent;
}

describe('WorkspaceKindsPage', () => {
  it("cards show each kind's status", () => {
    renderPage(SPEC_VIEWER_OFF);

    expect(within(cardOf('Markdown viewer')).getByText('Active')).toBeTruthy();
    expect(within(cardOf('Notes')).getByText('On')).toBeTruthy();
    expect(within(cardOf('Spec viewer')).getByText('Off')).toBeTruthy();
    expect(within(cardOf('Markdown viewer')).getByText('Read Markdown files and folders')).toBeTruthy();
    expect(within(cardOf('Notes')).getByText('Write, link and find your notes')).toBeTruthy();
    expect(within(cardOf('Spec viewer')).getByText('Browse specs and proposed changes')).toBeTruthy();
  });

  it('choose a kind from its card', async () => {
    const { onCommand, onClose, rerender } = renderPage(ALL_KINDS_ON);

    await userEvent.click(within(cardOf('Notes')).getByRole('button', { name: 'Notes' }));
    await rerender({ kinds: ALL_KINDS_ON.switchKind('notes') });
    await tick();

    expect(onCommand).toHaveBeenCalledWith({ kind: 'switchWorkspaceKind', kindId: 'notes' });
    expect(onClose).not.toHaveBeenCalled();
    expect(announcement()).toBe('Showing Notes.');
  });

  it('choosing a card switches kind and announces it', async () => {
    const { onCommand, rerender } = renderPage(ALL_KINDS_ON);
    const specViewer = within(cardOf('Spec viewer')).getByRole('button', { name: 'Spec viewer' });

    const markdownViewer = within(cardOf('Markdown viewer')).getByRole('button', { name: 'Markdown viewer' });
    expect(markdownViewer.getAttribute('aria-pressed')).toBe('true');
    expect(specViewer.getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(specViewer);
    await rerender({ kinds: ALL_KINDS_ON.switchKind('specViewer') });
    await tick();

    expect(onCommand).toHaveBeenCalledWith({ kind: 'switchWorkspaceKind', kindId: 'specViewer' });
    expect(announcement()).toBe('Showing Spec viewer.');
  });

  it('a chosen kind that is not shown in the end is not announced', async () => {
    const { onCommand, rerender } = renderPage(ALL_KINDS_ON);

    await userEvent.click(within(cardOf('Notes')).getByRole('button', { name: 'Notes' }));
    await rerender({ kinds: ALL_KINDS_ON });
    await tick();

    expect(onCommand).toHaveBeenCalledWith({ kind: 'switchWorkspaceKind', kindId: 'notes' });
    expect(announcement()).toBe('');
  });

  it('choosing the active kind drops an earlier choice', async () => {
    const { rerender } = renderPage(ALL_KINDS_ON);

    await userEvent.click(within(cardOf('Notes')).getByRole('button', { name: 'Notes' }));
    await userEvent.click(within(cardOf('Markdown viewer')).getByRole('button', { name: 'Markdown viewer' }));
    await rerender({ kinds: ALL_KINDS_ON.switchKind('notes') });
    await tick();

    expect(announcement()).toBe('');
  });

  it('only the last chosen kind is announced', async () => {
    const { rerender } = renderPage(ALL_KINDS_ON);

    await userEvent.click(within(cardOf('Notes')).getByRole('button', { name: 'Notes' }));
    await userEvent.click(within(cardOf('Spec viewer')).getByRole('button', { name: 'Spec viewer' }));
    await rerender({ kinds: ALL_KINDS_ON.switchKind('notes') });
    await tick();
    const afterTheFirstSwitch = announcement();
    await rerender({ kinds: ALL_KINDS_ON.switchKind('specViewer') });
    await tick();

    expect(afterTheFirstSwitch).toBe('');
    expect(announcement()).toBe('Showing Spec viewer.');
  });

  it('a turned-off kind cannot be chosen', async () => {
    const { onCommand } = renderPage(NOTES_OFF);
    const notes = cardOf('Notes');

    expect(within(notes).getByRole('button', { name: 'Notes' })).toHaveProperty('disabled', true);
    expect(within(notes).getByRole('button', { name: 'Open Notes' })).toHaveProperty('disabled', true);
    await userEvent.click(within(notes).getByRole('switch', { name: 'Notes on' }));

    expect(onCommand).toHaveBeenCalledWith({
      kind: 'setWorkspaceKindEnabled',
      kindId: 'notes',
      isEnabled: true,
    });
  });

  it('open the control wheel from the page', async () => {
    const { onCommand } = renderPage(ALL_KINDS_ON);
    const showWheel = screen.getByRole('button', { name: /^Show control wheel/ });

    expect(showWheel.textContent).toContain('Ctrl+Space');
    await userEvent.click(showWheel);

    expect(onCommand).toHaveBeenCalledWith({ kind: 'toggleControlWheel' });
  });

  it('leave the page', async () => {
    const { onCommand, onClose } = renderPage(ALL_KINDS_ON);

    await userEvent.click(within(cardOf('Notes')).getByRole('button', { name: 'Open Notes' }));

    expect(onCommand).toHaveBeenCalledWith({ kind: 'switchWorkspaceKind', kindId: 'notes' });
    expect(onClose).toHaveBeenCalledOnce();
    expect(onClose.mock.invocationCallOrder[0]).toBeLessThan(onCommand.mock.invocationCallOrder[0] ?? 0);
  });

  it('esc while composing text stays on the page', () => {
    const { onClose } = renderPage(ALL_KINDS_ON);
    const notes = within(cardOf('Notes')).getByRole('button', { name: 'Notes' });

    notes.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('leave the page with Esc after a click on its background', async () => {
    const { onClose } = renderPage(ALL_KINDS_ON);

    await userEvent.click(screen.getByText(/^Each kind is a different way/));
    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('leave the page with Esc without changing the kind', async () => {
    const { onCommand, onClose } = renderPage(ALL_KINDS_ON);
    within(cardOf('Notes')).getByRole('button', { name: 'Notes' }).focus();

    await userEvent.keyboard('{Escape}');

    expect(onCommand).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('turn a kind on', async () => {
    const { onCommand, rerender } = renderPage(SPEC_VIEWER_OFF);

    await userEvent.click(screen.getByRole('switch', { name: 'Spec viewer on' }));
    await rerender({ kinds: SPEC_VIEWER_OFF.enableKind('specViewer').state });

    expect(onCommand).toHaveBeenCalledWith({
      kind: 'setWorkspaceKindEnabled',
      kindId: 'specViewer',
      isEnabled: true,
    });
    const specViewer = cardOf('Spec viewer');
    expect(within(specViewer).getByText('On')).toBeTruthy();
    expect(within(specViewer).getByRole('button', { name: 'Spec viewer' })).toHaveProperty('disabled', false);
    expect(announcement()).toBe('Spec viewer is on.');
  });

  it('turning off a kind that is not shown announces it is off', async () => {
    const { onCommand } = renderPage(ALL_KINDS_ON);

    await userEvent.click(screen.getByRole('switch', { name: 'Notes on' }));

    expect(onCommand).toHaveBeenCalledWith({
      kind: 'setWorkspaceKindEnabled',
      kindId: 'notes',
      isEnabled: false,
    });
    expect(announcement()).toBe('Notes is off.');
  });

  it('turning off the active kind moves to the next one', async () => {
    const { onCommand } = renderPage(
      WorkspaceKindsState.fromSaved({
        enabledKindIds: ['markdownViewer', 'notes', 'specViewer'],
        activeKindId: 'notes',
      }),
    );

    await userEvent.click(screen.getByRole('switch', { name: 'Notes on' }));

    expect(onCommand).toHaveBeenCalledWith({
      kind: 'setWorkspaceKindEnabled',
      kindId: 'notes',
      isEnabled: false,
    });
    expect(announcement()).toBe('Notes is off. Showing Spec viewer.');
  });

  it('the last enabled kind stays on', async () => {
    const { onCommand } = renderPage(WorkspaceKindsState.initial());
    const lockedSwitch = screen.getByRole('switch', { name: 'Markdown viewer on' });

    expect(lockedSwitch.getAttribute('aria-checked')).toBe('true');
    expect(lockedSwitch.getAttribute('aria-disabled')).toBe('true');
    expect(lockedSwitch.tabIndex).toBe(0);
    await userEvent.click(lockedSwitch);

    expect(onCommand).not.toHaveBeenCalled();
    expect(announcement()).toBe('At least one kind stays on.');
  });

  it('activating the locked switch again announces it again', async () => {
    renderPage(WorkspaceKindsState.initial());
    const lockedSwitch = screen.getByRole('switch', { name: 'Markdown viewer on' });
    await userEvent.click(lockedSwitch);
    const changes: MutationRecord[] = [];
    const observer = new MutationObserver((records) => changes.push(...records));
    observer.observe(screen.getByRole('status'), { childList: true, characterData: true, subtree: true });

    await userEvent.click(lockedSwitch);
    changes.push(...observer.takeRecords());
    observer.disconnect();

    expect(changes.length).toBeGreaterThan(0);
    expect(announcement()).toBe('At least one kind stays on.');
  });

  it('the locked switch explains why', () => {
    renderPage(WorkspaceKindsState.initial());

    const lockedSwitch = screen.getByRole('switch', { name: 'Markdown viewer on' });

    expect(screen.getByRole('switch', { description: 'At least one kind stays on.' })).toBe(lockedSwitch);
    expect(lockedSwitch.hasAttribute('title')).toBe(false);
    expect(screen.getAllByRole('tooltip').map((tooltip) => tooltip.textContent.trim())).toEqual([
      'At least one kind stays on.',
    ]);
  });

  it('a planned kind has no switch', () => {
    const registry: readonly WorkspaceKind[] = WORKSPACE_KINDS.map((kind) =>
      kind.id === 'specViewer' ? { ...kind, availability: 'planned' } : kind,
    );
    renderPage(WorkspaceKindsState.initial(registry));

    const specViewer = cardOf('Spec viewer');

    expect(within(specViewer).getByText('Later')).toBeTruthy();
    expect(within(specViewer).queryByRole('switch')).toBeNull();
    expect(within(specViewer).queryByRole('button', { name: 'Open Spec viewer' })).toBeNull();
    expect(within(specViewer).getByRole('button', { name: 'Spec viewer' })).toHaveProperty('disabled', true);
  });

  it('opens Settings', async () => {
    const { onCommand } = renderPage(ALL_KINDS_ON);

    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(onCommand).toHaveBeenCalledWith({ kind: 'showSettings' });
  });

  it('tells how to open the wheel with a mouse button', () => {
    renderPage(ALL_KINDS_ON);

    expect(screen.getByText(/give a mouse button the shortcut Ctrl\+Space/)).toBeTruthy();
  });

  it('asks for a wheel shortcut before a mouse button can open it', () => {
    renderPage(ALL_KINDS_ON, null);

    expect(screen.getByText(/^Tip: give the control wheel a shortcut in Settings > Keyboard/)).toBeTruthy();
  });

  it('tab order follows the cards in reading order', async () => {
    renderPage(NOTES_OFF);
    screen.getByRole('heading', { level: 1, name: 'Workspace kinds' });
    const expectedOrder = [
      ['Markdown viewer', 'button', 'Markdown viewer'],
      ['Markdown viewer', 'button', 'Open Markdown viewer'],
      ['Markdown viewer', 'switch', 'Markdown viewer on'],
      ['Notes', 'switch', 'Notes on'],
      ['Spec viewer', 'button', 'Spec viewer'],
      ['Spec viewer', 'button', 'Open Spec viewer'],
      ['Spec viewer', 'switch', 'Spec viewer on'],
    ] as const;

    for (const [card, role, name] of expectedOrder) {
      await userEvent.tab();
      expect(document.activeElement, name).toBe(within(cardOf(card)).getByRole(role, { name }));
    }
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Show control wheel/ }));
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Settings' }));
  });

  it('every control has an accessible name', () => {
    renderPage(NOTES_OFF);

    const named = /\S/;

    expect(screen.getAllByRole('button', { name: named })).toEqual(screen.getAllByRole('button'));
    expect(screen.getAllByRole('switch', { name: named })).toEqual(screen.getAllByRole('switch'));
    expect(screen.getByRole('main', { name: 'Workspace kinds' })).toBeTruthy();
  });
});
