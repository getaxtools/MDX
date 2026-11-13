import type { ShortcutOverrides } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { effectiveCommandShortcuts } from '../shortcuts/effectiveCommandShortcuts';
import { SETTING_DEFINITIONS, type ShortcutKeysSetting } from './settingDefinitions';
import ShortcutSetting from './ShortcutSetting.svelte';

const controlWheelSetting = SETTING_DEFINITIONS.find(
  (setting): setting is ShortcutKeysSetting => setting.kind === 'shortcut',
);

function renderShortcutSetting(overrides: ShortcutOverrides = {}) {
  if (!controlWheelSetting) throw new Error('No shortcut setting');
  const onCommand = vi.fn();
  const props = {
    setting: controlWheelSetting,
    shortcuts: effectiveCommandShortcuts(overrides),
    platform: 'windows' as const,
    translator: createTranslator(),
    onCommand,
  };
  const rendered = render(ShortcutSetting, props);
  const row = screen.getByRole('group', { name: 'Show Control Wheel' });
  return { ...rendered, row, props, onCommand };
}

const changeButton = () => screen.getByRole('button', { name: 'Change…' });
const message = () => screen.getByRole('status').textContent;

describe('ShortcutSetting', () => {
  it('shows the current keys and how to give them to a mouse button', () => {
    const { row } = renderShortcutSetting();

    expect(row.querySelector('kbd')?.textContent).toBe('Ctrl+Shift+Space');
    expect(row.textContent).toContain('give it the keyboard shortcut Ctrl+Shift+Space');
  });

  it('Change records the next combination', async () => {
    const user = userEvent.setup();
    const { onCommand } = renderShortcutSetting();

    await user.click(changeButton());
    expect(message()).toBe('Press the new keys, or Esc to cancel.');
    await user.keyboard('{Control>}{Shift>}J{/Shift}{/Control}');

    expect(onCommand).toHaveBeenCalledWith({
      kind: 'setShortcut',
      commandId: 'toggleControlWheel',
      combination: ['ctrl', 'shift', 'J'],
    });
    expect(changeButton().getAttribute('aria-pressed')).toBe('false');
  });

  it('Esc cancels recording without a change and keeps the dialog open', async () => {
    const user = userEvent.setup();
    const { onCommand } = renderShortcutSetting();
    const onDialogKeydown = vi.fn();
    globalThis.document.body.addEventListener('keydown', onDialogKeydown);

    await user.click(changeButton());
    await user.keyboard('{Escape}');

    expect(onCommand).not.toHaveBeenCalled();
    expect(onDialogKeydown).not.toHaveBeenCalled();
    expect(changeButton().getAttribute('aria-pressed')).toBe('false');
    globalThis.document.body.removeEventListener('keydown', onDialogKeydown);
  });

  it('lone modifiers and composition are ignored', async () => {
    const user = userEvent.setup();
    const { onCommand } = renderShortcutSetting();

    await user.click(changeButton());
    await user.keyboard('{Control}{Shift}');
    changeButton().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'j', ctrlKey: true, isComposing: true, bubbles: true }),
    );

    expect(onCommand).not.toHaveBeenCalled();
    expect(changeButton().getAttribute('aria-pressed')).toBe('true');
  });

  it('a refusal names what uses the keys', async () => {
    const user = userEvent.setup();
    const { onCommand } = renderShortcutSetting();

    await user.click(changeButton());
    await user.keyboard('{Control>}s{/Control}');

    expect(message()).toBe('Ctrl+S is used for Save. Choose other keys.');
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('a key without a modifier says that a modifier is needed', async () => {
    const user = userEvent.setup();
    renderShortcutSetting();

    await user.click(changeButton());
    await user.keyboard('w');

    expect(message()).toBe('W needs a modifier key such as Ctrl.');
  });

  it('Space refused on its own does not start recording again', async () => {
    const user = userEvent.setup();
    renderShortcutSetting();

    await user.click(changeButton());
    await user.keyboard(' ');

    expect(message()).toBe('Space needs a modifier key such as Ctrl.');
    expect(changeButton().getAttribute('aria-pressed')).toBe('false');
  });

  it('a Ctrl+Alt combination shows the keyboard warning', async () => {
    const user = userEvent.setup();
    const { onCommand } = renderShortcutSetting();

    await user.click(changeButton());
    await user.keyboard('{Control>}{Alt>}j{/Alt}{/Control}');

    expect(onCommand).toHaveBeenCalledWith(expect.objectContaining({ combination: ['ctrl', 'alt', 'J'] }));
    expect(message()).toContain('On some keyboards Ctrl+Alt types a character instead.');
  });

  it('Remove and Reset to default send their commands and the row shows the new keys', async () => {
    const user = userEvent.setup();
    const { onCommand, rerender, props, row } = renderShortcutSetting({
      toggleControlWheel: ['ctrl', 'shift', 'J'],
    });
    expect(row.querySelector('kbd')?.textContent).toBe('Ctrl+Shift+J');

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await rerender({ ...props, shortcuts: effectiveCommandShortcuts({ toggleControlWheel: [] }) });
    expect(row.querySelector('kbd')).toBeNull();
    expect(row.textContent).toContain('None');
    expect(row.textContent).toContain('Give the control wheel a shortcut');

    await user.click(screen.getByRole('button', { name: 'Reset to default' }));
    await rerender({ ...props, shortcuts: effectiveCommandShortcuts({}) });

    expect(onCommand).toHaveBeenCalledWith({ kind: 'removeShortcut', commandId: 'toggleControlWheel' });
    expect(onCommand).toHaveBeenCalledWith({ kind: 'resetShortcut', commandId: 'toggleControlWheel' });
    expect(row.querySelector('kbd')?.textContent).toBe('Ctrl+Shift+Space');
  });
});
