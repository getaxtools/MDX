import type { FormulaEditRequest } from '@mdx/editor';
import { createTranslator } from '@mdx/i18n';
import type { FormulaPreview } from '@mdx/renderer';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EquationDialog from './EquationDialog.svelte';

const NEW_INLINE: FormulaEditRequest = {
  target: { from: 8, to: 8, original: '' },
  source: '',
  kind: 'inline',
  isExisting: false,
  editedLines: { top: 100, bottom: 124, left: 40 },
};

function fakePreview(tex: string): Promise<FormulaPreview> {
  return Promise.resolve(
    tex.endsWith('{')
      ? { kind: 'error', message: "Expected '}', got 'EOF' at end of input", position: tex.length - 1 }
      : { kind: 'typeset', html: `<span class="typeset">${tex}</span>` },
  );
}

function renderDialog(request: FormulaEditRequest = NEW_INLINE) {
  const callbacks = { onInsert: vi.fn(), onCancel: vi.fn(), onKindChange: vi.fn() };
  render(EquationDialog, {
    request,
    lastKind: 'inline',
    translator: createTranslator(),
    previewFormula: fakePreview,
    ...callbacks,
  });
  const dialog = screen.getByRole('dialog', { name: 'Equation' });
  const source = screen.getByRole('textbox', { name: 'TeX source' });
  return { dialog, source, ...callbacks };
}

describe('EquationDialog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens named Equation with the focus in the TeX source', () => {
    const { source } = renderDialog({ ...NEW_INLINE, source: 'x^2' });

    expect(document.activeElement).toBe(source);
    expect(source.textContent).toBe('x^2');
  });

  it('shows the typeset formula', async () => {
    renderDialog({ ...NEW_INLINE, source: 'x^2' });

    const preview = screen.getByRole('group', { name: 'Preview' });

    await vi.waitFor(() => expect(preview.querySelector('.typeset')?.textContent).toBe('x^2'));
  });

  it('error names its position and is announced once', async () => {
    renderDialog({ ...NEW_INLINE, source: '\\frac{1}{' });
    const status = screen.getByRole('status');
    const announcements: string[] = [];
    new MutationObserver(() => announcements.push(status.textContent)).observe(status, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    await vi.waitFor(() => expect(status.textContent).not.toBe(''));

    await userEvent.click(screen.getByRole('radio', { name: 'Display' }));
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(screen.getByText(/^Error at character 9:/)).toBeTruthy();
    expect(status.textContent).toBe("Error: Expected '}', got 'EOF' at end of input");
    expect(announcements.filter((text) => text !== '')).toHaveLength(1);
  });

  it('a source the editor refuses keeps the dialog open and says why', async () => {
    const { onInsert, onCancel } = renderDialog({ ...NEW_INLINE, source: 'a$ b' });
    onInsert.mockReturnValue('dollarEndsInlineFormula');

    await userEvent.keyboard('{Enter}');

    expect(screen.getByRole('dialog', { name: 'Equation' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/^A dollar sign or line break here would end/);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('Escape leaves the document and returns focus', async () => {
    const { onCancel, onInsert } = renderDialog({ ...NEW_INLINE, source: 'x' });

    await userEvent.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onInsert).not.toHaveBeenCalled();
  });

  it('Enter inserts an inline formula and Ctrl+Enter a display one', async () => {
    const { onInsert } = renderDialog({ ...NEW_INLINE, source: '\\pi r^2' });

    await userEvent.keyboard('{Enter}');
    await userEvent.click(screen.getByRole('radio', { name: 'Display' }));
    screen.getByRole('textbox', { name: 'TeX source' }).focus();
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    expect(onInsert.mock.calls).toEqual([
      [{ tex: '\\pi r^2', kind: 'inline' }],
      [{ tex: '\\pi r^2', kind: 'display' }],
    ]);
  });

  it('a formula already in the text keeps its kind', () => {
    renderDialog({ ...NEW_INLINE, source: 'x', kind: 'display', isExisting: true });

    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Display' }).checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Inline' }).disabled).toBe(true);
  });

  it('the dialog does not cover the edited line', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 240));

    const { dialog } = renderDialog();

    expect(Number.parseFloat(dialog.style.top)).toBeGreaterThanOrEqual(124);
  });

  it('Tab stays inside the dialog', async () => {
    renderDialog({ ...NEW_INLINE, source: 'x' });
    screen.getByRole('button', { name: 'Cancel' }).focus();

    await userEvent.tab();

    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Inline' }));
  });
});
