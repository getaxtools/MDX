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
  it('takes the focus only for a new request, never when other things change', async () => {
    const outside = document.body.appendChild(document.createElement('button'));
    const view = render(FolderSearchPanel, {
      translator: createTranslator(),
      focusRequest: 1,
      hasFolders: true,
      onSearch: vi.fn(() => Promise.resolve(RESULTS)),
      onOpenMatch: vi.fn(),
      isNotesSearch: true,
    });
    const input = screen.getByRole('searchbox', { name: 'Search in folders' });
    outside.focus();

    await view.rerender({
      notesIndexStatus: {
        locationId: 'one',
        indexed: 1,
        toIndex: 2,
        isBuilding: true,
        wasRebuilt: false,
        isWatched: true,
      },
    });
    expect(document.activeElement).toBe(outside);

    await view.rerender({ focusRequest: 2 });
    expect(document.activeElement).toBe(input);
    outside.remove();
  });

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

  describe('in a Notes workspace', () => {
    function renderNotesPanel(results: FolderSearchResults, isBuilding = false) {
      render(FolderSearchPanel, {
        translator: createTranslator(),
        focusRequest: 1,
        hasFolders: true,
        isNotesSearch: true,
        notesIndexStatus: {
          locationId: 'journal',
          indexed: 500,
          toIndex: 1200,
          isBuilding,
          wasRebuilt: false,
          isWatched: true,
        },
        onSearch: () => Promise.resolve(results),
        onOpenMatch: vi.fn(),
      });
      return screen.getByRole('searchbox', { name: 'Search in folders' });
    }

    it('explains filters and leaves out the case and whole-word options', () => {
      renderNotesPanel(RESULTS);

      expect(
        screen.getByText('Search ignores case and accents. Add tag:name or path:folder to narrow it.'),
      ).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Match Case' })).toBeNull();
    });

    it('shows indexing progress while the index is built', () => {
      renderNotesPanel(RESULTS, true);

      expect(screen.getByText('Indexing notes: 500 of 1,200…')).toBeTruthy();
    });

    it('shows the not-searched count of notes kept only online', async () => {
      const input = renderNotesPanel({ ...RESULTS, notSearchedOnlineOnly: 3 });

      await userEvent.type(input, 'setup{Enter}');

      expect(await screen.findByText(/3 notes kept only online were not searched\./)).toBeTruthy();
    });
  });

  it('a chosen tag fills the search box and lists the notes carrying it', async () => {
    const onOpenMatch = vi.fn();
    render(FolderSearchPanel, {
      translator: createTranslator(),
      focusRequest: 1,
      hasFolders: true,
      isNotesSearch: true,
      requestedQuery: 'tag:work',
      onSearch: () => Promise.resolve({ documents: [{ location: GUIDE, matches: [] }], isIncomplete: false }),
      onOpenMatch,
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Guide.md' }));

    expect(screen.getByRole<HTMLInputElement>('searchbox', { name: 'Search in folders' }).value).toBe(
      'tag:work',
    );
    expect(screen.getByText('1 note')).toBeTruthy();
    expect(onOpenMatch).toHaveBeenCalledWith('C:\\Docs\\Guide.md', 'tag:work', {
      isCaseSensitive: false,
      isWholeWord: false,
    });
  });

  describe('in a Spec viewer workspace', () => {
    function renderSpecSearch() {
      const onSearch = vi.fn(() => Promise.resolve(RESULTS));
      render(FolderSearchPanel, {
        translator: createTranslator(),
        focusRequest: 1,
        hasFolders: true,
        onSearch,
        onOpenMatch: vi.fn(),
        isSpecSearch: true,
      });
      return { onSearch, input: screen.getByRole('searchbox', { name: 'Search in folders' }) };
    }

    it('searches every spec document but archived changes until a scope is chosen', async () => {
      const { onSearch, input } = renderSpecSearch();

      await userEvent.type(input, 'pin{Enter}');

      expect(onSearch).toHaveBeenLastCalledWith(
        'pin',
        { isCaseSensitive: false, isWholeWord: false },
        { scope: 'all', isArchiveIncluded: false },
      );
    });

    it('searches again in each scope the user chooses', async () => {
      const { onSearch, input } = renderSpecSearch();
      await userEvent.type(input, 'pin{Enter}');
      const scopes = screen.getByRole('combobox', { name: 'Search in' });

      for (const [label, scope] of [
        ['Specs', 'specs'],
        ['Changes', 'changes'],
        ['Tasks', 'tasks'],
        ['Agent instructions', 'instructions'],
        ['All spec documents', 'all'],
      ] as const) {
        await userEvent.selectOptions(scopes, label);
        expect(onSearch).toHaveBeenLastCalledWith('pin', expect.anything(), {
          scope,
          isArchiveIncluded: false,
        });
      }
    });

    it('includes archived changes once the switch is on', async () => {
      const { onSearch, input } = renderSpecSearch();
      await userEvent.type(input, 'pin{Enter}');

      await userEvent.click(screen.getByRole('checkbox', { name: 'Include archived changes' }));

      expect(onSearch).toHaveBeenLastCalledWith('pin', expect.anything(), {
        scope: 'all',
        isArchiveIncluded: true,
      });
    });

    it('offers no scope outside a Spec viewer workspace', () => {
      renderPanel();

      expect(screen.queryByRole('combobox', { name: 'Search in' })).toBeNull();
      expect(screen.queryByRole('checkbox', { name: 'Include archived changes' })).toBeNull();
    });
  });
});
