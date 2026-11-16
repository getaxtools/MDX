import type { FormattingState } from '@mdx/editor';
import { createTranslator } from '@mdx/i18n';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FormattingToolbar from './FormattingToolbar.svelte';

const PLAIN: FormattingState = { pressed: [], headingLevel: 0 };

function renderToolbar(formatting: FormattingState = PLAIN, editingMode: 'richText' | 'source' = 'richText') {
  const callbacks = { onRun: vi.fn(), onToggleEditingMode: vi.fn(), onReturnToEditor: vi.fn() };
  const props = { formatting, editingMode, translator: createTranslator(), ...callbacks };
  const { rerender } = render(FormattingToolbar, props);
  const toolbar = screen.getByRole('toolbar', { name: 'Formatting' });
  return { toolbar, props, rerender, ...callbacks };
}

/** Lets the toolbar measure as if it were this wide, with every control 32 pixels wide. */
function layOutToolbarAt(widthPx: number): void {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private readonly callback: () => void) {}
      observe() {
        this.callback();
      }
      disconnect() {
        return undefined;
      }
    },
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(widthPx);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const controls = this.querySelectorAll('button').length || 1;
    return new DOMRect(0, 0, controls * 32, 32);
  });
}

describe('FormattingToolbar', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('one Tab stop and arrow keys move between controls', async () => {
    const { toolbar } = renderToolbar();
    const buttons = within(toolbar).getAllByRole('button');

    expect(buttons.filter((button) => button.tabIndex === 0)).toHaveLength(1);
    buttons[1]?.focus();
    await userEvent.keyboard('{ArrowRight}');

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Italic' }));
    await userEvent.keyboard('{End}');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Rich text' }));
  });

  it('Escape returns focus to the editor with its selection', async () => {
    const { onReturnToEditor } = renderToolbar();
    screen.getByRole('button', { name: 'Bold' }).focus();

    await userEvent.keyboard('{Escape}');

    expect(onReturnToEditor).toHaveBeenCalledOnce();
  });

  it('click keeps the editor selection', async () => {
    const { onRun } = renderToolbar();
    const bold = screen.getByRole('button', { name: 'Bold' });

    const isPressAllowed = await fireEvent.mouseDown(bold);
    await fireEvent.click(bold);

    expect(isPressAllowed).toBe(false);
    expect(onRun).toHaveBeenCalledWith('bold');
  });

  it('tooltip names the shortcut', () => {
    renderToolbar();

    const bold = screen.getByRole('button', { name: 'Bold' });

    expect(bold.title).toBe('Bold (Ctrl+B)');
    expect(bold.getAttribute('aria-keyshortcuts')).toBe('Control+B');
  });

  it('pressed state follows the caret', async () => {
    const { props, rerender } = renderToolbar({ pressed: ['bold'], headingLevel: 2 });
    const bold = screen.getByRole('button', { name: 'Bold' });
    const pressedAtFirst = bold.getAttribute('aria-pressed');

    await rerender({ ...props, formatting: { pressed: ['italic'], headingLevel: 0 } });

    expect(pressedAtFirst).toBe('true');
    expect(bold.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Italic' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Text style: Paragraph' })).toBeTruthy();
  });

  it('the heading menu names the level and sets it', async () => {
    const { onRun } = renderToolbar({ pressed: [], headingLevel: 2 });

    await userEvent.click(screen.getByRole('button', { name: 'Text style: Heading 2' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /^Heading 3/ }));

    expect(onRun).toHaveBeenCalledWith('heading3');
  });

  it('the Math split button starts a formula of the last kind, or the kind chosen from its menu', async () => {
    const { onRun } = renderToolbar();

    await userEvent.click(screen.getByRole('button', { name: 'Math' }));
    await userEvent.click(screen.getByRole('button', { name: 'Formula kind' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /^Display formula/ }));

    expect(onRun.mock.calls).toEqual([['formula'], ['displayMath']]);
  });

  it('the formula kinds name their shortcuts', async () => {
    renderToolbar();

    screen.getByRole('button', { name: 'Formula kind' }).focus();
    await userEvent.keyboard('{ArrowDown}');

    expect(screen.getByRole('menuitem', { name: /^Inline formula/ }).textContent).toContain('Alt+=');
    expect(screen.getByRole('menuitem', { name: /^Display formula/ }).textContent).toContain('Ctrl+Shift+M');
  });

  it('the Image button names Ctrl+Shift+I and runs the picture command', async () => {
    const { onRun } = renderToolbar();
    const image = screen.getByRole('button', { name: 'Image' });

    await userEvent.click(image);

    expect(image.title).toBe('Image (Ctrl+Shift+I)');
    expect(onRun).toHaveBeenCalledWith('insertImage');
  });

  it('Rich text button reports the mode', async () => {
    const { props, rerender, onToggleEditingMode } = renderToolbar(PLAIN, 'richText');
    const richText = screen.getByRole('button', { name: 'Rich text' });
    const pressedInRichText = richText.getAttribute('aria-pressed');

    await rerender({ ...props, editingMode: 'source' });
    await userEvent.click(richText);

    expect(pressedInRichText).toBe('true');
    expect(richText.getAttribute('aria-pressed')).toBe('false');
    expect(onToggleEditingMode).toHaveBeenCalledOnce();
  });

  it('a narrow window moves groups from the right into More formatting', () => {
    layOutToolbarAt(300);

    renderToolbar();

    expect(screen.queryByRole('button', { name: 'Table' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Bold' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'More formatting' })).toBeTruthy();
  });

  it('More formatting runs the same commands with the same states', async () => {
    layOutToolbarAt(300);
    const { onRun } = renderToolbar({ pressed: ['quote'], headingLevel: 0 });

    await userEvent.click(screen.getByRole('button', { name: 'More formatting' }));
    expect(screen.getByRole('menuitem', { name: /^Display formula/ })).toBeTruthy();
    expect(screen.getByRole('menuitemcheckbox', { name: /^Quote/ }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(screen.getByRole('menuitemcheckbox', { name: /^Rich text/ }).getAttribute('aria-checked')).toBe(
      'true',
    );
    await userEvent.click(screen.getByRole('menuitem', { name: /^Table/ }));

    expect(onRun).toHaveBeenCalledWith('table');
  });
});
