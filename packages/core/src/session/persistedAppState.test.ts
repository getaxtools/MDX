import { InMemoryDocumentFiles } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { FavouritesList } from '../favourites/FavouritesList';
import { RecentFilesList } from '../recent-files/RecentFilesList';
import { TabStrip } from '../tabs/TabStrip';
import { DEFAULT_VIEW_SETTINGS } from '../view/ViewSettings';
import { APP_STATE_SCHEMA_VERSION, restoreAppState, toPersistedAppState } from './persistedAppState';

const location = (path: string) => InMemoryDocumentFiles.locationOf(path);

describe('persisted app state', () => {
  it('round-trips tabs, recent files, favourites and view settings', () => {
    const tabStrip = TabStrip.empty().openOrFocus(location('a.md')).openOrFocus(location('b.md'));
    const recentFiles = RecentFilesList.empty().add(location('a.md'), 1).pin(location('a.md').canonicalKey);
    const favourites = FavouritesList.empty()
      .add(location('Specs'), 'folder')
      .rename(location('Specs').canonicalKey, 'Specs folder');

    const viewSettings = { ...DEFAULT_VIEW_SETTINGS, theme: 'dark' as const, zoomPercent: 125 };

    const saved: unknown = JSON.parse(
      JSON.stringify(toPersistedAppState({ tabStrip, recentFiles, favourites, viewSettings })),
    );
    const restored = restoreAppState(saved);

    expect(restored.wasReset).toBe(false);
    expect(restored.tabStrip.toSnapshot()).toEqual(tabStrip.toSnapshot());
    expect(restored.recentFiles.entries()).toEqual(recentFiles.entries());
    expect(restored.favourites.favourites()).toEqual(favourites.favourites());
    expect(restored.viewSettings).toEqual(viewSettings);
  });

  it('starts empty on first launch without reporting a reset', () => {
    const restored = restoreAppState(undefined);

    expect(restored.wasReset).toBe(false);
    expect(restored.tabStrip.tabs()).toEqual([]);
  });

  it.each([
    ['a string', 'garbage'],
    ['an array', []],
    ['an unknown schema version', { schemaVersion: 999 }],
  ])('resets to empty state when the saved state is %s', (_description, saved) => {
    const restored = restoreAppState(saved);

    expect(restored.wasReset).toBe(true);
    expect(restored.favourites.favourites()).toEqual([]);
  });

  it('drops individual invalid entries and keeps the valid ones', () => {
    const valid = { location: location('a.md'), isPinned: false, scrollRatio: 0 };
    const saved = {
      schemaVersion: APP_STATE_SCHEMA_VERSION,
      tabs: { tabs: [valid, { location: { canonicalKey: 1 } }, 'not a tab', { location: location('b.md') }] },
      recentFiles: [{ location: location('a.md'), isPinned: 'yes', lastOpenedAtMs: 1 }],
      favourites: [
        { location: location('c.md'), kind: 'shortcut' },
        { location: location('d.md'), kind: 'file', label: 7 },
      ],
    };

    const restored = restoreAppState(saved);

    expect(restored.tabStrip.tabs()).toEqual([valid]);
    expect(restored.recentFiles.entries()).toEqual([]);
    expect(restored.favourites.favourites()).toEqual([{ location: location('d.md'), kind: 'file' }]);
  });

  it('tolerates missing sections', () => {
    const restored = restoreAppState({ schemaVersion: APP_STATE_SCHEMA_VERSION });

    expect(restored.wasReset).toBe(false);
    expect(restored.tabStrip.tabs()).toEqual([]);
    expect(restored.recentFiles.entries()).toEqual([]);
    expect(restored.viewSettings).toEqual(DEFAULT_VIEW_SETTINGS);
  });
});
