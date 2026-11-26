import { DEFAULT_VIEW_SETTINGS, ZOOM_LEVELS_PERCENT, zoomIn } from '@mdx/core';
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

  describe('zoom stepper', () => {
    function renderAtZoom(zoomPercent: number) {
      const onZoomIn = vi.fn();
      const onZoomOut = vi.fn();
      const onResetZoom = vi.fn();
      const { rerender } = render(StatusBar, {
        document: savedDocument,
        zoomPercent,
        isSourceView: false,
        translator: createTranslator(),
        onResetZoom,
        onZoomIn,
        onZoomOut,
      });
      return { onZoomIn, onZoomOut, onResetZoom, rerender };
    }

    it('step through levels', async () => {
      let zoomPercent = 100;
      const { onZoomIn, rerender } = renderAtZoom(zoomPercent);
      onZoomIn.mockImplementation(() => {
        zoomPercent = zoomIn({ ...DEFAULT_VIEW_SETTINGS, zoomPercent }).zoomPercent;
        void rerender({ zoomPercent });
      });

      await userEvent.click(screen.getByRole('button', { name: 'Zoom In' }));
      await userEvent.click(screen.getByRole('button', { name: 'Zoom In' }));

      expect(zoomPercent).toBe(125);
      expect(screen.getByRole('button', { name: 'Zoom 125%, reset' }).textContent.trim()).toBe('125%');
    });

    it('ends of the range: zoom in is disabled at the highest level', () => {
      renderAtZoom(ZOOM_LEVELS_PERCENT.at(-1) ?? 0);

      expect(screen.getByRole('button', { name: 'Zoom In' }).hasAttribute('disabled')).toBe(true);
      expect(screen.getByRole('button', { name: 'Zoom Out' }).hasAttribute('disabled')).toBe(false);
    });

    it('zoom out is disabled at the lowest level', () => {
      renderAtZoom(ZOOM_LEVELS_PERCENT[0] ?? 0);

      expect(screen.getByRole('button', { name: 'Zoom Out' }).hasAttribute('disabled')).toBe(true);
      expect(screen.getByRole('button', { name: 'Zoom In' }).hasAttribute('disabled')).toBe(false);
    });

    it('reset from the value: activating the value resets to 100%', async () => {
      const { onResetZoom } = renderAtZoom(150);

      await userEvent.click(screen.getByRole('button', { name: 'Zoom 150%, reset' }));

      expect(onResetZoom).toHaveBeenCalledOnce();
    });

    it('zooms in and out from its buttons', async () => {
      const { onZoomIn, onZoomOut } = renderAtZoom(100);

      await userEvent.click(screen.getByRole('button', { name: 'Zoom In' }));
      await userEvent.click(screen.getByRole('button', { name: 'Zoom Out' }));

      expect(onZoomIn).toHaveBeenCalledOnce();
      expect(onZoomOut).toHaveBeenCalledOnce();
    });

    it('keeps focus in the stepper when a step reaches the end of the range', async () => {
      const { onZoomIn, onZoomOut, rerender } = renderAtZoom(250);
      onZoomIn.mockImplementation(() => void rerender({ zoomPercent: 300 }));
      onZoomOut.mockImplementation(() => void rerender({ zoomPercent: 50 }));

      await userEvent.click(screen.getByRole('button', { name: 'Zoom In' }));
      const focusedAtHighest = globalThis.document.activeElement;
      await userEvent.click(screen.getByRole('button', { name: 'Zoom Out' }));

      expect(focusedAtHighest).toBe(screen.getByRole('button', { name: 'Zoom Out' }));
      expect(globalThis.document.activeElement).toBe(screen.getByRole('button', { name: 'Zoom In' }));
    });

    it('names the shortcuts in its tooltips', () => {
      renderAtZoom(100);

      expect(screen.getByRole('button', { name: 'Zoom Out' }).title).toBe('Zoom Out (Ctrl+-)');
      expect(screen.getByRole('button', { name: 'Zoom 100%, reset' }).title).toBe('Reset Zoom (Ctrl+0)');
      expect(screen.getByRole('button', { name: 'Zoom In' }).title).toBe('Zoom In (Ctrl++)');
    });

    it('no document: the stepper is hidden without a document', () => {
      const { statusBar } = renderStatusBar(undefined);

      expect(screen.queryByRole('button', { name: /zoom/i })).toBeNull();
      expect(statusBar.textContent.trim()).toBe('');
    });
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

    it("shows the active kind's colour", () => {
      const button = renderWithWheelButton();

      expect(button.style.getPropertyValue('--kind-colour')).toBe('var(--color-kind-markdown-viewer)');
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

  it('shows that protected notes are unlocked, with a Lock button', async () => {
    const onLockProtectedNotes = vi.fn();
    render(StatusBar, {
      document: savedDocument,
      zoomPercent: 100,
      isSourceView: false,
      translator: createTranslator(),
      onResetZoom: vi.fn(),
      isProtectedSectionUnlocked: true,
      onLockProtectedNotes,
    });

    expect(screen.getByRole('contentinfo').textContent).toContain('Protected notes unlocked');
    await userEvent.click(screen.getByRole('button', { name: 'Lock Protected Notes' }));

    expect(onLockProtectedNotes).toHaveBeenCalledOnce();
  });

  it('shows no Lock button while no protected section is unlocked', () => {
    renderStatusBar(savedDocument);

    expect(screen.queryByRole('button', { name: 'Lock Protected Notes' })).toBeNull();
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

  it('shows the prompt injection badge only once the shown document was checked, and opens the panel', async () => {
    const onShowInjectionCheck = vi.fn();
    render(StatusBar, {
      document: savedDocument,
      zoomPercent: 100,
      isSourceView: false,
      translator: createTranslator(),
      onResetZoom: vi.fn(),
      injectionCheck: {
        documentKey: savedDocument.canonicalKey,
        status: 'checked',
        result: {
          rulesetVersion: '1.0.0',
          findings: [],
          isAgentFile: true,
          ignoredCount: 0,
          isPartial: false,
        },
        ignoredFindings: [],
        isCharactersOnly: false,
        findingRanges: [],
      },
      onShowInjectionCheck,
    });

    await userEvent.click(screen.getByRole('button', { name: /^No findings/ }));

    expect(onShowInjectionCheck).toHaveBeenCalledOnce();
  });

  it('shows no prompt injection badge before a check', () => {
    renderStatusBar(savedDocument);

    expect(screen.queryByRole('button', { name: /findings/ })).toBeNull();
  });
});
