import type { FormulaEditRequest } from '@mdx/editor';
import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import EquationEditorHost from './EquationEditorHost.svelte';

/** The dialog loads in a chunk of its own on first use, which on a busy machine takes a while. */
const LAZY_LOAD_WAIT = { timeout: 15_000 };
const LAZY_LOAD_TEST_TIMEOUT_MS = 20_000;

function newFormulaRequest(): FormulaEditRequest {
  return {
    target: { from: 0, to: 0, original: '' },
    source: 'x',
    kind: undefined,
    isExisting: false,
    editedLines: undefined,
  };
}

describe('EquationEditorHost', () => {
  it(
    'Inline or Display is remembered',
    async () => {
      const onInsert = vi.fn(() => 'written' as const);
      const props = {
        request: newFormulaRequest() as FormulaEditRequest | undefined,
        translator: createTranslator(),
        previewFormula: () => Promise.resolve({ kind: 'unavailable' as const }),
        onInsert,
        onCancel: vi.fn(),
      };
      const { rerender } = render(EquationEditorHost, props);
      const firstKind = await screen.findByRole<HTMLInputElement>(
        'radio',
        { name: 'Inline' },
        LAZY_LOAD_WAIT,
      );
      const wasInlineFirst = firstKind.checked;

      await userEvent.click(screen.getByRole('radio', { name: 'Display' }));
      await userEvent.click(screen.getByRole('button', { name: 'Insert' }));
      await rerender({ ...props, request: undefined });
      await rerender({ ...props, request: newFormulaRequest() });

      expect(wasInlineFirst).toBe(true);
      expect(onInsert).toHaveBeenCalledWith({ from: 0, to: 0, original: '' }, { tex: 'x', kind: 'display' });
      expect(
        (await screen.findByRole<HTMLInputElement>('radio', { name: 'Display' }, LAZY_LOAD_WAIT)).checked,
      ).toBe(true);
    },
    LAZY_LOAD_TEST_TIMEOUT_MS,
  );

  it('shows nothing without a request', () => {
    render(EquationEditorHost, {
      request: undefined,
      translator: createTranslator(),
      previewFormula: () => Promise.resolve({ kind: 'unavailable' as const }),
      onInsert: vi.fn(),
      onCancel: vi.fn(),
    });

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
