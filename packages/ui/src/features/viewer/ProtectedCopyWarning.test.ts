import { ViewerSession } from '@mdx/core';
import { createTranslator } from '@mdx/i18n';
import {
  InMemoryAppState,
  InMemoryDocumentExport,
  InMemoryDocumentFiles,
  InMemoryDocumentRequests,
} from '@mdx/platform';
import { createMarkdownRenderer } from '@mdx/renderer';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ViewerApp from './ViewerApp.svelte';
import { ViewerController, type ViewerSnapshot } from './ViewerController';

const SECTION_NOTE = String.raw`E:\Notes\.mdx-notes\protected\notes\Bank details.md`;
const PLAN = String.raw`E:\Notes\Plan.md`;

async function openedViewer(path: string) {
  const documentExport = new InMemoryDocumentExport();
  const printer = { printActiveDocument: vi.fn() };
  const translator = createTranslator();
  const controller = new ViewerController({
    session: new ViewerSession({
      documentFiles: new InMemoryDocumentFiles({
        [SECTION_NOTE]: '# Bank details\n\nPIN 4821',
        [PLAN]: '# Plan',
      }),
      appState: new InMemoryAppState(),
      now: () => 0,
    }),
    requests: new InMemoryDocumentRequests([path]),
    renderer: createMarkdownRenderer({ window }),
    translator,
    documentExport,
    printer,
  });
  let latest: ViewerSnapshot | undefined;
  controller.subscribe((snapshot) => (latest = snapshot));
  await controller.start();
  const snapshot = () => {
    if (!latest) throw new Error('no snapshot published');
    return latest;
  };
  return { controller, documentExport, printer, snapshot, translator };
}

describe('exporting or printing a protected note', () => {
  afterEach(() => vi.restoreAllMocks());

  it('starts no export until the user accepts an unprotected copy', async () => {
    const { controller, documentExport, translator } = await openedViewer(SECTION_NOTE);
    render(ViewerApp, {
      controller,
      translator,
      platform: 'windows',
      appInfo: { version: '1.0.0', dataFolder: 'C:\\Data' },
    });
    const user = userEvent.setup();

    await controller.execute({ kind: 'exportDocument', format: 'html' });
    await screen.findByRole('alertdialog', { name: 'Export an unprotected copy?' });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog', { name: 'Export an unprotected copy?' })).toBeNull();
    expect(documentExport.exported).toEqual([]);

    await controller.execute({ kind: 'exportDocument', format: 'html' });
    expect(documentExport.exported).toEqual([]);
    await user.click(await screen.findByRole('button', { name: 'Export Unprotected Copy' }));

    await waitFor(() => expect(documentExport.exported.map((copy) => copy.format)).toEqual(['html']));
  });

  it('takes Ctrl+P before any part of the page, so the browser never prints past the warning', async () => {
    const { controller, documentExport, translator } = await openedViewer(SECTION_NOTE);
    render(ViewerApp, {
      controller,
      translator,
      platform: 'windows',
      appInfo: { version: '1.0.0', dataFolder: 'C:\\Data' },
    });
    const stopsKeys = document.createElement('div');
    stopsKeys.addEventListener('keydown', (event) => event.stopPropagation(), { capture: true });
    document.body.append(stopsKeys);
    const printKey = new KeyboardEvent('keydown', {
      key: 'p',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });

    stopsKeys.dispatchEvent(printKey);

    expect(printKey.defaultPrevented).toBe(true);
    expect(await screen.findByRole('alertdialog', { name: 'Print an unprotected copy?' })).toBeTruthy();
    expect(documentExport.exported).toEqual([]);
    stopsKeys.remove();
  });

  it('asks before printing, and prints only once the user accepts', async () => {
    const { controller, printer, snapshot } = await openedViewer(SECTION_NOTE);

    await controller.execute({ kind: 'print' });
    expect(snapshot().openDialog).toBe('protectedPrintWarning');
    expect(snapshot().printRequest).toBeUndefined();
    controller.closeDialog();
    await controller.execute({ kind: 'confirmProtectedCopy' });
    expect(snapshot().printRequest).toBeUndefined();

    await controller.execute({ kind: 'print' });
    await controller.execute({ kind: 'confirmProtectedCopy' });

    expect(snapshot().openDialog).toBeUndefined();
    expect(snapshot().printRequest).toBe(1);
    expect(printer.printActiveDocument).not.toHaveBeenCalled();
  });

  it('drops an accepted copy when another document is shown by then', async () => {
    const { controller, snapshot } = await openedViewer(SECTION_NOTE);

    await controller.execute({ kind: 'exportDocument', format: 'plainText' });
    await controller.openDocuments([PLAN]);
    await controller.execute({ kind: 'confirmProtectedCopy' });

    expect(snapshot().exportRequest).toBeUndefined();
  });

  it('exports and prints a plain note without asking', async () => {
    const { controller, snapshot } = await openedViewer(PLAN);

    await controller.execute({ kind: 'exportDocument', format: 'html' });
    await controller.execute({ kind: 'print' });

    expect(snapshot().openDialog).toBeUndefined();
    expect(snapshot().exportRequest).toEqual({ format: 'html', number: 1 });
    expect(snapshot().printRequest).toBe(1);
  });
});
