import { createTranslator } from '@mdx/i18n';
import { EMPTY_IMPORT_REPORT } from '@mdx/platform';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ViewerCommand } from '../viewer/viewerCommands';
import NoteImportDialog from './NoteImportDialog.svelte';
import type { NoteImportView } from './NoteTransferActions';

const COPYING: NoteImportView = { progress: { done: 3, total: 10, isListing: false } };

function renderDialog(view: NoteImportView) {
  const onCommand = vi.fn<(command: ViewerCommand) => void>();
  const translator = createTranslator();
  const { rerender } = render(NoteImportDialog, { view, translator, onCommand });
  return { onCommand, showView: (next: NoteImportView) => rerender({ view: next, translator, onCommand }) };
}

describe('NoteImportDialog', () => {
  it('opens in the shared frame with a header close, a quiet continue in background and stop import as the one primary', async () => {
    const { onCommand } = renderDialog(COPYING);

    const close = screen.getByRole('button', { name: 'Close' });
    await userEvent.click(screen.getByRole('button', { name: 'Continue in Background' }));

    expect(close.getAttribute('title')).toBe('Close (Esc)');
    expect(screen.getByRole('button', { name: 'Stop Import' }).classList.contains('primary')).toBe(true);
    expect(onCommand).toHaveBeenCalledWith({ kind: 'closeNotesTransfer' });
    expect(onCommand).not.toHaveBeenCalledWith({ kind: 'cancelNotesImport' });
  });

  it('while copying, focus starts on continue in background, so enter does not stop the import', async () => {
    const { onCommand } = renderDialog(COPYING);

    await userEvent.keyboard('{Enter}');

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Continue in Background' }));
    expect(onCommand).not.toHaveBeenCalledWith({ kind: 'cancelNotesImport' });
    expect(onCommand).toHaveBeenCalledWith({ kind: 'closeNotesTransfer' });
  });

  it('the report offers only the header close, and esc closes it after stop import took focus', async () => {
    const { onCommand, showView } = renderDialog(COPYING);
    screen.getByRole('button', { name: 'Stop Import' }).focus();

    await showView({ ...COPYING, report: { ...EMPTY_IMPORT_REPORT, copiedFiles: 3, wasCancelled: true } });
    await userEvent.keyboard('{Escape}');

    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Close',
    ]);
    expect(onCommand).toHaveBeenCalledWith({ kind: 'closeNotesTransfer' });
  });

  it('shows progress while copying and stops on request', async () => {
    const { onCommand } = renderDialog({ progress: { done: 3, total: 10, isListing: false } });

    await userEvent.click(screen.getByRole('button', { name: 'Stop Import' }));

    expect(screen.getByRole('status').textContent).toBe('Copying 3 of 10 files…');
    expect(screen.getByRole('progressbar', { name: 'Import notes' }).getAttribute('value')).toBe('3');
    expect(onCommand).toHaveBeenCalledWith({ kind: 'cancelNotesImport' });
  });

  it('reports renamed files and syntax that is not supported, as text', () => {
    renderDialog({
      progress: { done: 2, total: 2, isListing: false },
      report: {
        ...EMPTY_IMPORT_REPORT,
        copiedFiles: 2,
        renamedFiles: [{ wanted: 'Plan.md', savedAs: 'Plan (imported).md' }],
        unsupportedSyntax: [
          { note: 'Plan.md', kind: 'blockReference', line: 3, detail: '<b>Plan#^a1b2</b>' },
        ],
      },
    });

    expect(
      screen.getByText(
        'Plan.md was saved as Plan (imported).md, because a file with that name is already there.',
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Plan.md, line 3: block reference <b>Plan#\^a1b2<\/b>/)).toBeTruthy();
    expect(document.querySelector('[role="dialog"] b')).toBeNull();
  });

  it('closes with the keyboard once the import is done', async () => {
    const { onCommand } = renderDialog({
      progress: { done: 1, total: 1, isListing: false },
      report: { ...EMPTY_IMPORT_REPORT, copiedFiles: 1 },
    });

    await userEvent.keyboard('{Escape}');

    expect(onCommand).toHaveBeenCalledWith({ kind: 'closeNotesTransfer' });
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });
});
