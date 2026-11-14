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

  describe('control wheel button', () => {
    function renderWithWheelButton(onShowControlWheel = vi.fn()) {
      render(StatusBar, {
        document: savedDocument,
        zoomPercent: 100,
        isSourceView: false,
        translator: createTranslator(),
        controlWheelButton: {
          activeKindId: 'markdownViewer',
          shortcut: 'Ctrl+Shift+Space',
          onShowControlWheel,
        },
        onResetZoom: vi.fn(),
      });
      return screen.getByRole('button', { name: 'Markdown viewer, show control wheel' });
    }

    it('is not shown unless asked for', () => {
      renderStatusBar(savedDocument);

      expect(screen.queryByRole('button', { name: /show control wheel/ })).toBeNull();
    });

    it('shows the active kind with its icon and the wheel shortcut in its tooltip', () => {
      const button = renderWithWheelButton();

      expect(button.textContent.trim()).toBe('Markdown viewer');
      expect(button.querySelector('svg')).toBeTruthy();
      expect(button.title).toBe('Show Control Wheel (Ctrl+Shift+Space)');
    });

    it('opens the wheel', async () => {
      const onShowControlWheel = vi.fn();
      const button = renderWithWheelButton(onShowControlWheel);

      await userEvent.click(button);

      expect(onShowControlWheel).toHaveBeenCalledOnce();
    });
  });

  it('shows and announces the number of cursors when there is more than one', () => {
    render(StatusBar, {
      document: savedDocument,
      zoomPercent: 100,
      isSourceView: false,
      cursorCount: 3,
      translator: createTranslator(),
      onResetZoom: vi.fn(),
    });

    expect(screen.getByRole('status').textContent.trim()).toBe('3 cursors');
  });

  it('says nothing about cursors with one', () => {
    renderStatusBar(savedDocument);

    expect(screen.getByRole('status').textContent.trim()).toBe('');
  });

  it('shows progress towards a word goal and announces when it is reached', () => {
    render(StatusBar, {
      document: { ...savedDocument, statistics: { words: 1200, characters: 6000, readingMinutes: 5 } },
      zoomPercent: 100,
      isSourceView: false,
      wordGoal: 1000,
      wordsThisSession: 35,
      translator: createTranslator(),
      onResetZoom: vi.fn(),
    });

    const words = screen.getByRole('button', { name: /1,200 of 1,000 words/ });

    expect(screen.getByRole('progressbar', { name: 'Word goal' }).getAttribute('aria-valuenow')).toBe('100');
    expect(words.title).toBe('35 words added this session');
    expect(screen.getByRole('status').textContent.trim()).toBe('Word goal reached.');
  });
});
