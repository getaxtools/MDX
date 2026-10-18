import { InMemoryDocumentFiles } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { MAX_REOPENABLE_TABS, TabStrip } from './TabStrip';

const location = (path: string) => InMemoryDocumentFiles.locationOf(path);
const keyOf = (path: string) => location(path).canonicalKey;
const namesOf = (tabStrip: TabStrip) => tabStrip.tabs().map((tab) => tab.location.fileName);
const activeNameOf = (tabStrip: TabStrip) => tabStrip.activeTab()?.location.fileName;

function tabStripWith(...paths: string[]): TabStrip {
  return paths.reduce((tabStrip, path) => tabStrip.openOrFocus(location(path)), TabStrip.empty());
}

describe('TabStrip', () => {
  describe('opening', () => {
    it('opens a document as a new active tab', () => {
      const tabStrip = tabStripWith('a.md');

      expect(namesOf(tabStrip)).toEqual(['a.md']);
      expect(activeNameOf(tabStrip)).toBe('a.md');
    });

    it('inserts a new tab right after the active tab', () => {
      const tabStrip = tabStripWith('a.md', 'b.md', 'c.md')
        .activate(keyOf('a.md'))
        .openOrFocus(location('d.md'));

      expect(namesOf(tabStrip)).toEqual(['a.md', 'd.md', 'b.md', 'c.md']);
    });

    it('focuses the existing tab instead of opening the same document twice', () => {
      const tabStrip = tabStripWith('Guide.md', 'b.md').openOrFocus(location('GUIDE.md'));

      expect(namesOf(tabStrip)).toEqual(['Guide.md', 'b.md']);
      expect(activeNameOf(tabStrip)).toBe('Guide.md');
    });

    it('never inserts a new tab among pinned tabs', () => {
      const tabStrip = tabStripWith('a.md', 'b.md')
        .pin(keyOf('a.md'))
        .pin(keyOf('b.md'))
        .activate(keyOf('a.md'))
        .openOrFocus(location('c.md'));

      expect(namesOf(tabStrip)).toEqual(['a.md', 'b.md', 'c.md']);
    });
  });

  describe('closing', () => {
    it('activates the tab to the right when the active tab closes', () => {
      const tabStrip = tabStripWith('a.md', 'b.md', 'c.md').activate(keyOf('b.md')).close(keyOf('b.md'));

      expect(activeNameOf(tabStrip)).toBe('c.md');
    });

    it('activates the tab to the left when the last tab closes', () => {
      const tabStrip = tabStripWith('a.md', 'b.md').close(keyOf('b.md'));

      expect(activeNameOf(tabStrip)).toBe('a.md');
    });

    it('keeps the active tab when another tab closes', () => {
      const tabStrip = tabStripWith('a.md', 'b.md', 'c.md').close(keyOf('a.md'));

      expect(activeNameOf(tabStrip)).toBe('c.md');
    });

    it('has no active tab after closing the only tab', () => {
      const tabStrip = tabStripWith('a.md').close(keyOf('a.md'));

      expect(tabStrip.tabs()).toEqual([]);
      expect(tabStrip.activeTab()).toBeUndefined();
    });

    it('ignores closing a document that is not open', () => {
      const tabStrip = tabStripWith('a.md');

      expect(tabStrip.close(keyOf('missing.md'))).toBe(tabStrip);
    });

    it('closes all other unpinned tabs', () => {
      const tabStrip = tabStripWith('pinned.md', 'a.md', 'b.md', 'c.md')
        .pin(keyOf('pinned.md'))
        .closeOthers(keyOf('b.md'));

      expect(namesOf(tabStrip)).toEqual(['pinned.md', 'b.md']);
      expect(activeNameOf(tabStrip)).toBe('b.md');
    });

    it('closes unpinned tabs to the right', () => {
      const tabStrip = tabStripWith('a.md', 'b.md', 'c.md', 'd.md').closeToTheRight(keyOf('b.md'));

      expect(namesOf(tabStrip)).toEqual(['a.md', 'b.md']);
      expect(activeNameOf(tabStrip)).toBe('b.md');
    });

    it('ignores close-others and close-to-the-right for a document that is not open', () => {
      const tabStrip = tabStripWith('a.md');

      expect(tabStrip.closeOthers(keyOf('missing.md'))).toBe(tabStrip);
      expect(tabStrip.closeToTheRight(keyOf('missing.md'))).toBe(tabStrip);
    });
  });

  describe('reopening closed tabs', () => {
    it('reopens the most recently closed tab and activates it', () => {
      const tabStrip = tabStripWith('a.md', 'b.md', 'c.md')
        .close(keyOf('b.md'))
        .close(keyOf('c.md'))
        .reopenLastClosed();

      expect(namesOf(tabStrip)).toEqual(['a.md', 'c.md']);
      expect(activeNameOf(tabStrip)).toBe('c.md');
    });

    it('reopens tabs closed together one by one', () => {
      const tabStrip = tabStripWith('a.md', 'b.md', 'c.md')
        .closeOthers(keyOf('a.md'))
        .reopenLastClosed()
        .reopenLastClosed();

      expect(namesOf(tabStrip)).toEqual(['a.md', 'b.md', 'c.md']);
    });

    it('focuses a closed document that was opened again in the meantime', () => {
      const tabStrip = tabStripWith('a.md', 'b.md')
        .close(keyOf('b.md'))
        .openOrFocus(location('b.md'))
        .activate(keyOf('a.md'))
        .reopenLastClosed();

      expect(namesOf(tabStrip)).toEqual(['a.md', 'b.md']);
      expect(activeNameOf(tabStrip)).toBe('b.md');
    });

    it('does nothing when no tab was closed', () => {
      const tabStrip = tabStripWith('a.md');

      expect(tabStrip.reopenLastClosed()).toBe(tabStrip);
    });

    it(`remembers at most ${String(MAX_REOPENABLE_TABS)} closed tabs`, () => {
      const paths = Array.from({ length: MAX_REOPENABLE_TABS + 5 }, (_, index) => `${String(index)}.md`);
      const allClosed = paths.reduce((tabStrip, path) => tabStrip.close(keyOf(path)), tabStripWith(...paths));

      const reopenedEverything = paths.reduce((tabStrip) => tabStrip.reopenLastClosed(), allClosed);

      expect(reopenedEverything.tabs()).toHaveLength(MAX_REOPENABLE_TABS);
    });

    it('reopens a closed pinned tab among the pinned tabs', () => {
      const tabStrip = tabStripWith('a.md', 'b.md', 'c.md')
        .pin(keyOf('a.md'))
        .pin(keyOf('b.md'))
        .close(keyOf('a.md'))
        .reopenLastClosed();

      expect(namesOf(tabStrip)).toEqual(['b.md', 'a.md', 'c.md']);
      expect(tabStrip.tabs().map((tab) => tab.isPinned)).toEqual([true, true, false]);
    });
  });

  describe('switching tabs', () => {
    it('cycles forward and backward with wrap-around', () => {
      const tabStrip = tabStripWith('a.md', 'b.md', 'c.md');

      expect(activeNameOf(tabStrip.activateNext())).toBe('a.md');
      expect(activeNameOf(tabStrip.activatePrevious())).toBe('b.md');
    });

    it('activates tabs by number key, with 9 meaning the last tab', () => {
      const tabStrip = tabStripWith('a.md', 'b.md', 'c.md');

      expect(activeNameOf(tabStrip.activateByNumberKey(1))).toBe('a.md');
      expect(activeNameOf(tabStrip.activateByNumberKey(9))).toBe('c.md');
      expect(tabStrip.activateByNumberKey(5)).toBe(tabStrip);
    });

    it('ignores switching when no tabs are open', () => {
      const tabStrip = TabStrip.empty();

      expect(tabStrip.activateNext()).toBe(tabStrip);
      expect(tabStrip.activate(keyOf('a.md'))).toBe(tabStrip);
    });
  });

  describe('reordering and pinning', () => {
    it('moves a tab to a new position', () => {
      const tabStrip = tabStripWith('a.md', 'b.md', 'c.md').move(keyOf('c.md'), 0);

      expect(namesOf(tabStrip)).toEqual(['c.md', 'a.md', 'b.md']);
    });

    it('keeps an unpinned tab out of the pinned area when moving it', () => {
      const tabStrip = tabStripWith('pinned.md', 'a.md', 'b.md')
        .pin(keyOf('pinned.md'))
        .move(keyOf('b.md'), 0);

      expect(namesOf(tabStrip)).toEqual(['pinned.md', 'b.md', 'a.md']);
    });

    it('keeps a pinned tab inside the pinned area when moving it', () => {
      const tabStrip = tabStripWith('pinned.md', 'a.md').pin(keyOf('pinned.md')).move(keyOf('pinned.md'), 5);

      expect(namesOf(tabStrip)).toEqual(['pinned.md', 'a.md']);
    });

    it('ignores moving a document that is not open', () => {
      const tabStrip = tabStripWith('a.md');

      expect(tabStrip.move(keyOf('missing.md'), 0)).toBe(tabStrip);
    });

    it('moves a newly pinned tab to the end of the pinned area', () => {
      const tabStrip = tabStripWith('a.md', 'b.md', 'c.md').pin(keyOf('a.md')).pin(keyOf('c.md'));

      expect(namesOf(tabStrip)).toEqual(['a.md', 'c.md', 'b.md']);
      expect(tabStrip.tabs().map((tab) => tab.isPinned)).toEqual([true, true, false]);
    });

    it('moves an unpinned tab to the start of the unpinned area', () => {
      const tabStrip = tabStripWith('a.md', 'b.md', 'c.md')
        .pin(keyOf('a.md'))
        .pin(keyOf('b.md'))
        .unpin(keyOf('a.md'));

      expect(namesOf(tabStrip)).toEqual(['b.md', 'a.md', 'c.md']);
    });

    it('does not close pinned tabs with close-others', () => {
      const tabStrip = tabStripWith('a.md', 'b.md').pin(keyOf('a.md')).closeOthers(keyOf('b.md'));

      expect(namesOf(tabStrip)).toEqual(['a.md', 'b.md']);
    });

    it('ignores pinning an already pinned tab', () => {
      const tabStrip = tabStripWith('a.md').pin(keyOf('a.md'));

      expect(tabStrip.pin(keyOf('a.md'))).toBe(tabStrip);
    });
  });

  describe('restoring', () => {
    it('remembers scroll position, clamped between top and bottom', () => {
      const tabStrip = tabStripWith('a.md', 'b.md')
        .updateScrollRatio(keyOf('a.md'), 0.4)
        .updateScrollRatio(keyOf('b.md'), 3);

      expect(tabStrip.tabs().map((tab) => tab.scrollRatio)).toEqual([0.4, 1]);
    });

    it('round-trips through a snapshot', () => {
      const original = tabStripWith('a.md', 'b.md', 'c.md')
        .pin(keyOf('c.md'))
        .activate(keyOf('b.md'))
        .updateScrollRatio(keyOf('b.md'), 0.5);

      const restored = TabStrip.fromSnapshot(original.toSnapshot());

      expect(restored.tabs()).toEqual(original.tabs());
      expect(activeNameOf(restored)).toBe('b.md');
    });

    it('repairs a snapshot with duplicates, misplaced pinned tabs and an unknown active tab', () => {
      const snapshot = {
        tabs: [
          { location: location('a.md'), isPinned: false, scrollRatio: 0 },
          { location: location('pinned.md'), isPinned: true, scrollRatio: 0 },
          { location: location('A.md'), isPinned: false, scrollRatio: 0 },
        ],
        activeKey: keyOf('closed.md'),
      };

      const restored = TabStrip.fromSnapshot(snapshot);

      expect(namesOf(restored)).toEqual(['pinned.md', 'a.md']);
      expect(activeNameOf(restored)).toBe('pinned.md');
    });

    it('produces a snapshot without an active key when empty', () => {
      expect(TabStrip.empty().toSnapshot()).toEqual({ tabs: [] });
    });
  });
});
