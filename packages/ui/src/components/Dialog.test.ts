import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import Dialog from './Dialog.svelte';
import { CLOSE_FALLBACK_MS } from './dialogClosing';

const NAME_FIELD = createRawSnippet(() => ({ render: () => '<label>Name <input /></label>' }));
const NOTES_FIELD = createRawSnippet(() => ({ render: () => '<label>Notes <textarea></textarea></label>' }));
const RESTORE_BUTTONS = createRawSnippet(() => ({
  render: () => '<ul><li><button>Restore Plan</button></li><li><button>Restore Ideas</button></li></ul>',
}));
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

/** jsdom runs no CSS animations, so this stands in for the exit fade until the returned function ends it. */
function holdExitFade(): () => void {
  let endFade: (() => void) | undefined;
  const finished = new Promise<void>((resolve) => {
    endFade = resolve;
  });
  Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
    configurable: true,
    value: () => [{ finished }],
  });
  onTestFinished(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'getAnimations');
  });
  return () => endFade?.();
}

/** Lets every promise callback queued so far run first. */
async function nextTask(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
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

  it('two frames open at once are each named by their own title and described by their own purpose', () => {
    renderFrame();
    renderFrame({ title: 'Delete Workspace', purpose: 'The documents in it stay where they are.' });

    const rename = screen.getByRole('dialog', { name: 'Rename Workspace' });
    const deletion = screen.getByRole('dialog', { name: 'Delete Workspace' });

    expect(document.getElementById(deletion.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'The documents in it stay where they are.',
    );
    expect(within(rename).getByRole('region', { name: 'Rename Workspace' })).toBeTruthy();
    expect(within(deletion).getByRole('region', { name: 'Delete Workspace' })).toBeTruthy();
  });

  it('a question is announced as an alert dialog and described by its body', () => {
    renderFrame({ title: 'Delete Workspace?', purpose: undefined, children: MESSAGE_ONLY, isAlert: true });

    const question = screen.getByRole('alertdialog', { name: 'Delete Workspace?' });

    expect(document.getElementById(question.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'The workspace has no open documents.',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
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

  it('esc and close: esc that a control inside already handled leaves the dialog open', async () => {
    const { onClose } = renderFrame();
    const name = screen.getByRole('textbox', { name: 'Name' });
    name.addEventListener('keydown', (event) => event.preventDefault());

    await fireEvent.keyDown(name, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('esc and close: esc that ends an input method composition leaves the dialog open', async () => {
    const { onClose } = renderFrame();

    await fireEvent.keyDown(screen.getByRole('textbox', { name: 'Name' }), {
      key: 'Escape',
      isComposing: true,
    });

    expect(onClose).not.toHaveBeenCalled();
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

  it('a warning starts on cancel: enter in the body does not take the step', async () => {
    const { onClose, onActivate } = renderFrame({ shouldStartOnCancel: true, children: MESSAGE_ONLY });

    screen.getByRole('region', { name: 'Rename Workspace' }).focus();
    await userEvent.keyboard('{Enter}');

    expect(onActivate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a warning starts on cancel: enter on the dialog itself does not take the step', async () => {
    const { onClose, onActivate } = renderFrame({ shouldStartOnCancel: true, children: MESSAGE_ONLY });

    screen.getByRole('dialog').focus();
    await userEvent.keyboard('{Enter}');

    expect(onActivate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a warning starts on cancel: enter in a field does not take the step', async () => {
    const { onActivate } = renderFrame({ shouldStartOnCancel: true });

    screen.getByRole('textbox', { name: 'Name' }).focus();
    await userEvent.keyboard('{Enter}');

    expect(onActivate).not.toHaveBeenCalled();
  });

  it('a warning starts on cancel: ctrl+enter in a multi-line field does not take the step', async () => {
    const { onActivate } = renderFrame({ shouldStartOnCancel: true, children: NOTES_FIELD });

    screen.getByRole('textbox', { name: 'Notes' }).focus();
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    expect(onActivate).not.toHaveBeenCalled();
  });

  it('a warning starts on cancel: the primary still takes the step when it is pressed', async () => {
    const { onActivate } = renderFrame({ shouldStartOnCancel: true });

    screen.getByRole('button', { name: 'Rename' }).focus();
    await userEvent.keyboard('{Enter}');

    expect(onActivate).toHaveBeenCalledOnce();
  });

  it('a dialog that turns into a warning moves focus to cancel, so a second enter does not take the step', async () => {
    const { onClose, onActivate, rerender } = renderFrame({ children: MESSAGE_ONLY });
    expect(focusedButtonName()).toBe('Rename');

    await rerender({ shouldStartOnCancel: true, primary: { label: 'Replace', onActivate } });
    await userEvent.keyboard('{Enter}');

    expect(onActivate).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('when the focused primary goes away, focus moves to the header close and esc still closes', async () => {
    const { onClose, rerender } = renderFrame({ children: MESSAGE_ONLY });
    expect(focusedButtonName()).toBe('Rename');

    await rerender({ primary: undefined, cancelLabel: undefined, isInformational: true });

    expect(focusedButtonName()).toBe('Close');
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('when the focused primary goes away and cancel stays, focus moves to cancel', async () => {
    const { rerender } = renderFrame({ children: MESSAGE_ONLY });
    expect(focusedButtonName()).toBe('Rename');

    await rerender({ primary: undefined });

    expect(focusedButtonName()).toBe('Cancel');
  });

  it('a primary that goes away while typing in a field leaves focus in the field', async () => {
    const { rerender } = renderFrame({ children: NAME_FIELD });
    const field = screen.getByRole('textbox', { name: 'Name' });
    field.focus();

    await rerender({ primary: undefined });

    expect(document.activeElement).toBe(field);
  });

  it('a dialog that cannot be cancelled and turns into a warning moves focus off its primary, so enter does not take the step', async () => {
    const { onActivate, rerender } = renderFrame({ children: MESSAGE_ONLY, canClose: false });
    expect(focusedButtonName()).toBe('Rename');

    await rerender({ shouldStartOnCancel: true });
    await userEvent.keyboard('{Enter}');

    expect(document.activeElement).toBe(screen.getByRole('dialog'));
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('a dialog that turns into a warning moves focus from a field to cancel', async () => {
    const { rerender } = renderFrame({ children: NAME_FIELD });
    screen.getByRole('textbox', { name: 'Name' }).focus();

    await rerender({ shouldStartOnCancel: true });

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
  });

  it('when a focused button in the content goes away, focus moves to the header close and esc still closes', async () => {
    const { onClose } = renderFrame({
      children: RESTORE_BUTTONS,
      cancelLabel: undefined,
      primary: undefined,
      isInformational: true,
    });
    const restorePlan = screen.getByRole('button', { name: 'Restore Plan' });
    restorePlan.focus();

    restorePlan.closest('li')?.remove();
    await nextTask();
    await userEvent.keyboard('{Escape}');

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('a button in the content that goes away while another control has focus leaves focus there', async () => {
    renderFrame({
      children: RESTORE_BUTTONS,
      cancelLabel: undefined,
      primary: undefined,
      isInformational: true,
    });
    const restoreIdeas = screen.getByRole('button', { name: 'Restore Ideas' });
    restoreIdeas.focus();

    screen.getByRole('button', { name: 'Restore Plan' }).closest('li')?.remove();
    await nextTask();

    expect(document.activeElement).toBe(restoreIdeas);
  });

  it('a long title or purpose with a name or path wraps inside the header beside the close', () => {
    const styles = readFileSync(join(import.meta.dirname, 'Dialog.svelte'), 'utf8');

    const heading = /\n {2}\.heading \{([^}]*)\}/.exec(styles)?.[1] ?? '';

    expect(heading).toMatch(/min-width: 0;/);
    expect(heading).toMatch(/overflow-wrap: anywhere;/);
  });

  it('contrast theme backdrop: forced colours draw a solid system backdrop with no blur and a visible border', () => {
    const styles = readFileSync(join(import.meta.dirname, 'Dialog.svelte'), 'utf8');
    const forcedColours = /@media \(forced-colors: active\) \{([\s\S]*?)\n {2}\}/.exec(styles)?.[1] ?? '';

    expect(forcedColours).toMatch(
      /\.backdrop\.shared-frame \{[^}]*backdrop-filter: none;[^}]*background: Canvas;/,
    );
    expect(forcedColours).toMatch(/\.dialog\.shared-frame \{[^}]*border-color: CanvasText;/);
  });

  it('sheet opens and closes: the close waits for the exit fade, then focus returns to the opener', async () => {
    const endExitFade = holdExitFade();
    const opener = focusOpener();
    const view = renderFrame();
    view.onClose.mockImplementation(() => view.unmount());

    await userEvent.keyboard('{Escape}');

    expect(view.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);

    endExitFade();

    await vi.waitFor(() => expect(view.onClose).toHaveBeenCalledOnce());
    expect(document.activeElement).toBe(opener);
  });

  it('sheet opens and closes: a fade that never reports its end still closes', async () => {
    holdExitFade();
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const { onClose } = renderFrame();

    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await vi.advanceTimersByTimeAsync(CLOSE_FALLBACK_MS - 1);

    expect(onClose).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('sheet opens and closes: a second close or an enter during the fade does nothing more', async () => {
    const endExitFade = holdExitFade();
    const { onClose, onActivate } = renderFrame();

    await userEvent.keyboard('{Escape}');
    await fireEvent.keyDown(screen.getByRole('textbox', { name: 'Name' }), { key: 'Enter' });
    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    endExitFade();

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('sheet opens and closes: a dialog removed during the fade does not close again', async () => {
    const endExitFade = holdExitFade();
    const view = renderFrame();

    await userEvent.keyboard('{Escape}');
    view.unmount();
    endExitFade();
    await nextTask();

    expect(view.onClose).not.toHaveBeenCalled();
  });

  it('sheet opens and closes: the focused primary does not run from the keyboard during the fade', async () => {
    const endExitFade = holdExitFade();
    const { onClose, onActivate } = renderFrame({ children: MESSAGE_ONLY });

    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    endExitFade();

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('sheet opens and closes: a focused footer control does not run from the keyboard during the fade', async () => {
    const endExitFade = holdExitFade();
    const onExport = vi.fn();
    const exportButton = createRawSnippet(() => ({
      render: () => '<button>Export</button>',
      setup: (button: Element) => {
        button.addEventListener('click', onExport);
      },
    }));
    const { onClose } = renderFrame({ children: MESSAGE_ONLY, footer: exportButton });
    screen.getByRole('button', { name: 'Export' }).focus();

    await userEvent.keyboard('{ >}{Escape}{/ }');
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    endExitFade();

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onExport).not.toHaveBeenCalled();
  });

  it('sheet opens and closes: a key released during the fade still reaches the app', async () => {
    const endExitFade = holdExitFade();
    const releasedKeys: string[] = [];
    const trackRelease = (event: KeyboardEvent) => releasedKeys.push(event.key);
    window.addEventListener('keyup', trackRelease);
    onTestFinished(() => window.removeEventListener('keyup', trackRelease));
    const { onClose } = renderFrame({ children: MESSAGE_ONLY });

    await userEvent.keyboard('{Control>}{Escape}{/Control}');
    endExitFade();

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(releasedKeys).toContain('Control');
  });

  it('sheet opens and closes: a click during the fade leaves focus in the dialog', async () => {
    const endExitFade = holdExitFade();
    const { onClose } = renderFrame({ children: MESSAGE_ONLY });
    const frame = screen.getByRole('dialog');
    const backdrop = frame.parentElement ?? frame;

    const canClickMoveFocusWhileOpen = await fireEvent.mouseDown(frame);
    await userEvent.keyboard('{Escape}');
    const canClickMoveFocusDuringFade = await fireEvent.mouseDown(backdrop);
    endExitFade();

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(canClickMoveFocusWhileOpen).toBe(true);
    expect(canClickMoveFocusDuringFade).toBe(false);
  });

  it('sheet opens and closes: a dialog the caller keeps open can be closed again', async () => {
    const endExitFade = holdExitFade();
    const { onClose } = renderFrame();

    await userEvent.keyboard('{Escape}');
    endExitFade();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    await userEvent.keyboard('{Escape}');

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(2));
  });

  it('sheet opens and closes: a close handler that fails leaves the dialog ready to close again', async () => {
    const { onClose } = renderFrame();
    onClose.mockImplementationOnce(() => {
      throw new Error('close failed');
    });
    const reportedErrors: unknown[] = [];
    const catchReportedError = (event: ErrorEvent) => {
      event.preventDefault();
      reportedErrors.push(event.error);
    };
    globalThis.addEventListener('error', catchReportedError);
    onTestFinished(() => {
      globalThis.removeEventListener('error', catchReportedError);
    });

    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('{Escape}');

    expect(reportedErrors).toHaveLength(1);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('sheet opens and closes: the close fades over the medium speed with the exit easing', () => {
    const styles = readFileSync(join(import.meta.dirname, 'Dialog.svelte'), 'utf8');
    const tokens = readFileSync(join(import.meta.dirname, '..', 'tokens', 'tokens.css'), 'utf8');
    const fadeOut = /@keyframes fade-out \{([\s\S]*?)\n {2}\}/.exec(styles)?.[1] ?? '';
    const closingBackdrop = /\.backdrop\.closing \{([^}]*)\}/.exec(styles)?.[1] ?? '';

    expect(closingBackdrop).toMatch(
      /animation: fade-out var\(--motion-medium\) var\(--easing-exit\) forwards;/,
    );
    expect(closingBackdrop).not.toMatch(/pointer-events/);
    expect(styles).toMatch(/\.dialog\.shared-frame\.closing \{[^}]*pointer-events: none;/);
    expect(styles).not.toMatch(/\.dialog[^{]*\.closing \{[^}]*animation/);
    expect(tokens).toMatch(/--easing-exit: cubic-bezier\(/);
    expect(fadeOut).toMatch(/opacity: 0;/);
    expect(fadeOut).not.toMatch(/transform|scale|translate/);
  });

  it('an informational dialog has the shared frame with only the header close, focused first', () => {
    render(Dialog, {
      title: 'About MDX',
      closeLabel: 'Close',
      closeTooltip: 'Close (Esc)',
      isInformational: true,
      onClose: vi.fn(),
      children: MESSAGE_ONLY,
    });
    const close = screen.getByRole('button', { name: 'Close' });

    expect(screen.getAllByRole('button')).toEqual([close]);
    expect(close.closest('header')).not.toBeNull();
    expect(screen.getByRole('dialog').lastElementChild).toBe(
      screen.getByRole('region', { name: 'About MDX' }),
    );
    expect(close.title).toBe('Close (Esc)');
    expect(document.activeElement).toBe(close);
  });

  it('an informational dialog closes with esc and returns focus to the opener', async () => {
    const opener = focusOpener();
    const onClose = vi.fn(() => view.unmount());
    const view = render(Dialog, {
      title: 'About MDX',
      closeLabel: 'Close',
      isInformational: true,
      onClose,
      children: MESSAGE_ONLY,
    });

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(opener);
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
