import { createTranslator } from '@mdx/i18n';
import { fireEvent, render, screen } from '@testing-library/svelte';
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
});
