import { createTranslator } from '@mdx/i18n';
import { EMPTY_IMPORT_REPORT } from '@mdx/platform';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ViewerCommand } from '../viewer/viewerCommands';
import NoteImportDialog from './NoteImportDialog.svelte';
import type { NoteImportView } from './NoteTransferActions';

function renderDialog(view: NoteImportView) {
  const onCommand = vi.fn<(command: ViewerCommand) => void>();
  render(NoteImportDialog, { view, translator: createTranslator(), onCommand });
  return { onCommand };
}

describe('NoteImportDialog', () => {
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
