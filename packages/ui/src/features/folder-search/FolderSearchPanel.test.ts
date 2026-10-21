import { createTranslator } from '@mdx/i18n';
import { InMemoryDocumentFiles, type FolderSearchResults } from '@mdx/platform';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import FolderSearchPanel from './FolderSearchPanel.svelte';

const GUIDE = InMemoryDocumentFiles.locationOf('C:\\Docs\\Guide.md');
const RESULTS: FolderSearchResults = {
  documents: [
    {
      location: GUIDE,
      matches: [
        { lineNumber: 3, preview: 'Run setup first', ranges: [[4, 9]] },
        { lineNumber: 8, preview: 'setup again', ranges: [[0, 5]] },
      ],
    },
  ],
  isIncomplete: false,
};

function renderPanel({
  hasFolders = true,
  onSearch = vi.fn(() => Promise.resolve(RESULTS)),
}: { hasFolders?: boolean; onSearch?: () => Promise<FolderSearchResults> } = {}) {
  const onOpenMatch = vi.fn();
  render(FolderSearchPanel, {
    translator: createTranslator(),
    focusRequest: 1,
    hasFolders,
    onSearch,
    onOpenMatch,
  });
  return { onSearch, onOpenMatch, input: screen.getByRole('searchbox', { name: 'Search in folders' }) };
}

describe('FolderSearchPanel', () => {
  it('focuses the search box when asked', () => {
    const { input } = renderPanel();

    expect(document.activeElement).toBe(input);
  });

  it('searches on Enter and lists matching lines with the match highlighted', async () => {
    const { onSearch, input } = renderPanel();

    await userEvent.type(input, 'setup{Enter}');

    expect(onSearch).toHaveBeenCalledWith('setup', { isCaseSensitive: false, isWholeWord: false });
    expect(await screen.findByText('2 results in 1 document')).toBeTruthy();
    const match = screen.getByRole('button', { name: 'Guide.md, Line 3: Run setup first' });
    expect(match.querySelector('mark')?.textContent).toBe('setup');
  });

  it('opens a match with the query and options that found it', async () => {
    const { onOpenMatch, input } = renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Match Case' }));
    await userEvent.type(input, 'setup{Enter}');

    await userEvent.click(await screen.findByRole('button', { name: 'Guide.md, Line 8: setup again' }));

    expect(onOpenMatch).toHaveBeenCalledWith('C:\\Docs\\Guide.md', 'setup', {
      isCaseSensitive: true,
      isWholeWord: false,
    });
  });

  it('searches once typing pauses', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { onSearch, input } = renderPanel();

    await userEvent.type(input, 'set');
    await vi.advanceTimersByTimeAsync(300);
    vi.useRealTimers();

    expect(onSearch).toHaveBeenCalledOnce();
    expect(onSearch).toHaveBeenCalledWith('set', { isCaseSensitive: false, isWholeWord: false });
  });

  it('says when nothing matches and when the search failed', async () => {
    const onSearch = vi
      .fn()
      .mockResolvedValueOnce({ documents: [], isIncomplete: false })
      .mockRejectedValueOnce(new Error('denied'));
    const { input } = renderPanel({ onSearch });

    await userEvent.type(input, 'zebra{Enter}');
    expect(await screen.findByText('Nothing in the opened and favourite folders matches.')).toBeTruthy();
    await userEvent.type(input, 's{Enter}');

    expect(await screen.findByText('The folders could not be searched.')).toBeTruthy();
  });

  it('says that more results exist when the search stopped at its limit', async () => {
    const { input } = renderPanel({ onSearch: () => Promise.resolve({ ...RESULTS, isIncomplete: true }) });

    await userEvent.type(input, 'setup{Enter}');

    expect((await screen.findByRole('status')).textContent).toContain('Only the first results are shown.');
  });

  it('explains that a folder is needed before anything can be searched', () => {
    const { input } = renderPanel({ hasFolders: false });

    expect(input.hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('Open a folder or add one to favourites');
  });
});
