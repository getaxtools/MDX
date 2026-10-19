import { createTranslator } from '@mdx/i18n';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { RenderedActiveDocument } from '../viewer/ViewerController';
import StatusBar from './StatusBar.svelte';

const savedDocument: RenderedActiveDocument = {
  canonicalKey: 'c:\\docs\\a.md',
  displayPath: 'C:\\Docs\\a.md',
  fileName: 'a.md',
  isUntitled: false,
  html: '',
  outline: [],
  statistics: { words: 1, characters: 1234, readingMinutes: 3 },
  encoding: 'utf-8',
  lineEnding: 'crlf',
  scrollRatio: 0,
  source: '# Source',
};

function renderStatusBar(document: RenderedActiveDocument | undefined, isSourceView = false) {
  const onResetZoom = vi.fn();
  const onReopenWithEncoding = vi.fn();
  render(StatusBar, {
    document,
    zoomPercent: 125,
    isSourceView,
    translator: createTranslator(),
    onResetZoom,
    onReopenWithEncoding,
  });
  return {
    onResetZoom,
    onReopenWithEncoding,
    statusBar: screen.getByRole('contentinfo', { name: 'Document information' }),
  };
}

describe('StatusBar', () => {
  it('shows the path, view mode, statistics, encoding and line endings of the document', () => {
    const { statusBar } = renderStatusBar(savedDocument);

    expect(statusBar.textContent).toContain('C:\\Docs\\a.md');
    expect(statusBar.textContent).toContain('Preview');
    expect(statusBar.textContent).toContain('1 word');
    expect(statusBar.textContent).toContain('1,234 characters');
    expect(statusBar.textContent).toContain('3 min read');
    expect(statusBar.textContent).toContain('Encoding: UTF-8');
    expect(statusBar.textContent).toContain('Line endings: CRLF');
  });

  it('says when the source is shown', () => {
    const { statusBar } = renderStatusBar(savedDocument, true);

    expect(statusBar.textContent).toContain('Source');
  });

  it('says that a new document is not saved yet', () => {
    const { statusBar } = renderStatusBar({ ...savedDocument, fileName: 'Untitled-1.md', isUntitled: true });

    expect(statusBar.textContent).toContain('Untitled-1.md (not saved)');
  });

  it('shows only the zoom level when no document is open', () => {
    const { statusBar } = renderStatusBar(undefined);

    expect(statusBar.textContent.replace(/\s+/g, ' ').trim()).toBe('125%');
  });

  it('resets the zoom when the zoom level is clicked', async () => {
    const { onResetZoom } = renderStatusBar(savedDocument);

    await userEvent.click(screen.getByRole('button', { name: 'Zoom 125% - reset to 100%' }));

    expect(onResetZoom).toHaveBeenCalledOnce();
  });

  it('reopens the document with an encoding chosen from the encoding menu', async () => {
    const { onReopenWithEncoding } = renderStatusBar(savedDocument);

    await userEvent.click(screen.getByRole('button', { name: 'Encoding: UTF-8' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Western European (Windows-1252)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Encoding: UTF-8' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Detect Automatically' }));

    expect(onReopenWithEncoding.mock.calls).toEqual([['windows-1252'], [undefined]]);
  });

  it('offers no other encoding for a document that is not saved yet', () => {
    renderStatusBar({ ...savedDocument, isUntitled: true });

    expect(screen.getByRole('button', { name: 'Encoding: UTF-8' }).hasAttribute('disabled')).toBe(true);
  });
});
