import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import Dialog from './Dialog.svelte';

const NAME_FIELD = createRawSnippet(() => ({ render: () => '<label>Name <input /></label>' }));
const NOTES_FIELD = createRawSnippet(() => ({ render: () => '<label>Notes <textarea></textarea></label>' }));
const MESSAGE_ONLY = createRawSnippet(() => ({
  render: () => '<p>The workspace has no open documents.</p>',
}));

function renderFrame(overrides: Record<string, unknown> = {}) {
  const onClose = vi.fn();
  const onActivate = vi.fn();
  const view = render(Dialog, {
    title: 'Rename Workspace',
    purpose: 'The name shows in the title bar and the workspace switcher.',
    closeLabel: 'Close',
    closeTooltip: 'Close (Esc)',
    cancelLabel: 'Cancel',
    primary: { label: 'Rename', onActivate },
    onClose,
    children: NAME_FIELD,
    ...overrides,
  });
  return { ...view, onClose, onActivate };
}

function focusOpener(): HTMLButtonElement {
  const opener = document.createElement('button');
  opener.textContent = 'Rename Workspace…';
  document.body.append(opener);
  onTestFinished(() => opener.remove());
  opener.focus();
  return opener;
}

function buttonName(button: Element): string {
  return button.getAttribute('aria-label') ?? button.textContent.trim();
}

function focusedButtonName(): string {
  return document.activeElement ? buttonName(document.activeElement) : '';
}

describe('Dialog frame', () => {
  it('names the dialog by its title and describes it by its purpose line', () => {
    renderFrame();

    const dialog = screen.getByRole('dialog', { name: 'Rename Workspace' });

    const description = document.getElementById(dialog.getAttribute('aria-describedby') ?? '');

    expect(description?.textContent).toBe('The name shows in the title bar and the workspace switcher.');
    expect(screen.getAllByRole('button').map(buttonName)).toEqual(['Close', 'Cancel', 'Rename']);
  });

  it('focus starts in the first field and enter activates the primary', async () => {
    const { onActivate, onClose } = renderFrame();

    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' }));
    await userEvent.keyboard('Plans{Enter}');

    expect(onActivate).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('focus starts on the primary when the dialog has no field', () => {
    renderFrame({ children: MESSAGE_ONLY });

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Rename' }));
  });

  it('focus starts on cancel when the primary is disabled and there is no field', () => {
    renderFrame({
      children: MESSAGE_ONLY,
      primary: { label: 'Rename', onActivate: vi.fn(), isDisabled: true },
    });

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
  });

  it('a held enter does not press the primary again', async () => {
    const { onActivate } = renderFrame();

    await fireEvent.keyDown(screen.getByRole('textbox', { name: 'Name' }), { key: 'Enter', repeat: true });

    expect(onActivate).not.toHaveBeenCalled();
  });

  it('enter on a focused button presses that button, not the primary', async () => {
    const { onActivate, onClose } = renderFrame();

    screen.getByRole('button', { name: 'Cancel' }).focus();
    await userEvent.keyboard('{Enter}');

    expect(onClose).toHaveBeenCalledOnce();
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('enter does nothing while the primary is disabled', async () => {
    const onActivate = vi.fn();
    renderFrame({ primary: { label: 'Rename', onActivate, isDisabled: true } });

    await userEvent.keyboard('{Enter}');

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Rename' }).disabled).toBe(true);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('multi-line field keeps enter: enter in a multi-line field adds a line and ctrl+enter submits', async () => {
    const { onActivate } = renderFrame({ children: NOTES_FIELD });
    const notes = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Notes' });

    await userEvent.keyboard('first{Enter}second');

    expect(notes.value).toBe('first\nsecond');
    expect(onActivate).not.toHaveBeenCalled();

    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    expect(onActivate).toHaveBeenCalledOnce();
  });

  it('focus stays inside: tab wraps inside the dialog', async () => {
    renderFrame();

    screen.getByRole('button', { name: 'Rename' }).focus();
    await userEvent.tab();

    expect(focusedButtonName()).toBe('Close');

    await userEvent.tab({ shift: true });

    expect(focusedButtonName()).toBe('Rename');
  });

  it('esc and close: esc closes without applying and returns focus to the opener', async () => {
    const opener = focusOpener();
    const view = renderFrame();
    view.onClose.mockImplementation(() => view.unmount());

    await userEvent.keyboard('{Escape}');

    expect(view.onClose).toHaveBeenCalledOnce();
    expect(view.onActivate).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(opener);
  });

  it('focus stays inside: ctrl+tab on the last control is left to the app', async () => {
    renderFrame();
    const rename = screen.getByRole('button', { name: 'Rename' });
    rename.focus();

    const isNotPrevented = await fireEvent.keyDown(rename, { key: 'Tab', ctrlKey: true });

    expect(isNotPrevented).toBe(true);
    expect(document.activeElement).toBe(rename);
  });

  it('esc and close: clicking close returns focus to the opener', async () => {
    const opener = focusOpener();
    const view = renderFrame();
    view.onClose.mockImplementation(() => view.unmount());

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(view.onClose).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(opener);
  });

  it('esc and close: close has an accessible name and an esc tooltip', async () => {
    const { onClose, onActivate } = renderFrame();
    const close = screen.getByRole('button', { name: 'Close' });

    await userEvent.click(close);

    expect(close.title).toBe('Close (Esc)');
    expect(onClose).toHaveBeenCalledOnce();
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('a warning starts on cancel: focus starts on cancel and enter closes without the step', async () => {
    const { onClose, onActivate } = renderFrame({ shouldStartOnCancel: true });

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.keyboard('{Enter}');

    expect(onClose).toHaveBeenCalledOnce();
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('contrast theme backdrop: forced colours draw a solid system backdrop with no blur and a visible border', () => {
    const styles = readFileSync(join(import.meta.dirname, 'Dialog.svelte'), 'utf8');
    const forcedColours = /@media \(forced-colors: active\) \{([\s\S]*?)\n {2}\}/.exec(styles)?.[1] ?? '';

    expect(forcedColours).toMatch(
      /\.backdrop\.shared-frame \{[^}]*backdrop-filter: none;[^}]*background: Canvas;/,
    );
    expect(forcedColours).toMatch(/\.dialog\.shared-frame \{[^}]*border-color: CanvasText;/);
  });

  it('keeps the earlier layout with one close button when no cancel label is given', () => {
    render(Dialog, { title: 'About MDX', closeLabel: 'Close', onClose: vi.fn(), children: NAME_FIELD });

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Close']);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
  });

  it('an earlier-layout dialog leaves enter to its own controls', async () => {
    const onActivate = vi.fn();
    const onClose = vi.fn();
    render(Dialog, {
      title: 'About MDX',
      closeLabel: 'Close',
      primary: { label: 'Rename', onActivate },
      onClose,
      children: NAME_FIELD,
    });

    screen.getByRole('textbox', { name: 'Name' }).focus();
    await userEvent.keyboard('{Enter}');

    expect(onActivate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
