import { createTranslator } from '@mdx/i18n';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PasteTableDialog from './PasteTableDialog.svelte';

const EXCEL_CELLS = 'Fruit\tQty\r\nApple\t3\r\n';

function renderDialog() {
  const onOpenAsNewDocument = vi.fn();
  const onClose = vi.fn();
  const writeClipboard = vi.fn(() => Promise.resolve());
  render(PasteTableDialog, {
    translator: createTranslator(),
    renderPreview: (markdown: string) => `<table><caption>${String(markdown.length)}</caption></table>`,
    writeClipboard,
    onOpenAsNewDocument,
    onClose,
  });
  return { onOpenAsNewDocument, onClose, writeClipboard };
}

async function pasteCells(text: string) {
  await fireEvent.input(screen.getByRole('textbox', { name: 'Cells' }), { target: { value: text } });
}

const markdownOutput = () => screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Markdown' }).value;

describe('PasteTableDialog', () => {
  it('waits in the cells box for the user to paste', () => {
    renderDialog();

    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Cells' }));
    expect(screen.getByRole('button', { name: 'Open as New Document' }).hasAttribute('disabled')).toBe(true);
  });

  it('turns pasted Excel cells into a Markdown table with a preview', async () => {
    renderDialog();

    await pasteCells(EXCEL_CELLS);

    expect(markdownOutput().split('\n')).toEqual(['| Fruit | Qty |', '| ----- | --: |', '| Apple |   3 |']);
    expect(screen.getByRole('region', { name: 'Preview' }).querySelector('table')).not.toBeNull();
  });

  it('names the columns when the first row is not a header', async () => {
    renderDialog();
    await pasteCells(EXCEL_CELLS);

    await userEvent.click(screen.getByRole('checkbox', { name: 'First row is a header' }));

    expect(markdownOutput().split('\n')[0]).toBe('| Column 1 | Column 2 |');
  });

  it('copies the Markdown and says so', async () => {
    const { writeClipboard } = renderDialog();
    await pasteCells(EXCEL_CELLS);

    await userEvent.click(screen.getByRole('button', { name: 'Copy Markdown' }));

    expect(writeClipboard).toHaveBeenCalledWith(markdownOutput());
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
  });

  it('opens the table as a new document', async () => {
    const { onOpenAsNewDocument } = renderDialog();
    await pasteCells(EXCEL_CELLS);

    await userEvent.click(screen.getByRole('button', { name: 'Open as New Document' }));

    expect(onOpenAsNewDocument).toHaveBeenCalledWith(markdownOutput());
  });

  it('closes with Escape or Cancel', async () => {
    const { onClose } = renderDialog();

    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('opens in the shared frame with a header close, a quiet cancel and open as new document as the one primary', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: 'Paste Table from Excel' });
    const close = screen.getByRole('button', { name: 'Close' });
    const buttonNames = within(dialog)
      .getAllByRole('button')
      .map((button) => button.textContent.trim() || button.getAttribute('aria-label'));

    expect(close.title).toBe('Close (Esc)');
    expect(close.closest('header')).not.toBeNull();
    expect(buttonNames).toEqual(['Close', 'Copy Markdown', 'Cancel', 'Open as New Document']);
    expect(dialog.getAttribute('aria-describedby')).not.toBeNull();
    expect(document.getElementById(dialog.getAttribute('aria-describedby') ?? '')?.textContent).toContain(
      'paste them below with Ctrl+V',
    );
  });

  it('ctrl+enter in the cells box opens the table, and enter alone adds a line', async () => {
    const { onOpenAsNewDocument } = renderDialog();
    await pasteCells(EXCEL_CELLS);
    const cells = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Cells' });
    cells.focus();

    await userEvent.keyboard('{Enter}');
    expect(onOpenAsNewDocument).not.toHaveBeenCalled();
    expect(cells.value).toBe('Fruit\tQty\nApple\t3\n\n');

    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    expect(onOpenAsNewDocument).toHaveBeenCalledWith(markdownOutput());
  });

  it('enter on the header-row checkbox opens the table', async () => {
    const { onOpenAsNewDocument } = renderDialog();
    await pasteCells(EXCEL_CELLS);
    screen.getByRole('checkbox', { name: 'First row is a header' }).focus();

    await userEvent.keyboard('{Enter}');

    expect(onOpenAsNewDocument).toHaveBeenCalledWith(markdownOutput());
  });

  it('escape while composing text closes nothing', async () => {
    const { onClose } = renderDialog();

    await fireEvent.keyDown(screen.getByRole('textbox', { name: 'Cells' }), {
      key: 'Escape',
      isComposing: true,
    });

    expect(onClose).not.toHaveBeenCalled();
  });
});
