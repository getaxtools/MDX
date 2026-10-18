import { createTranslator } from '@mdx/i18n';
import { InMemoryDocumentFiles } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { commandForTabMenuItem, tabContextMenuItems } from './tabContextMenu';

const translator = createTranslator();
const tab = { location: InMemoryDocumentFiles.locationOf('a.md'), isPinned: false, scrollRatio: 0 };

describe('tab context menu', () => {
  it('offers close, close others, close to the right, pin and reopen', () => {
    const items = tabContextMenuItems(tab, { index: 0, tabCount: 3 }, translator);

    expect(items.map((item) => item.label)).toEqual([
      'Close',
      'Close Others',
      'Close to the Right',
      'Pin Tab',
      'Reopen Closed Tab',
    ]);
    expect(items.some((item) => item.isDisabled)).toBe(false);
  });

  it('disables actions that would do nothing', () => {
    const items = tabContextMenuItems(tab, { index: 0, tabCount: 1 }, translator);

    expect(items.filter((item) => item.isDisabled).map((item) => item.id)).toEqual([
      'closeOthers',
      'closeToTheRight',
    ]);
  });

  it('shows the Close shortcut only on the active tab, and the Reopen shortcut always', () => {
    const shortcutsOf = (activeKey: string) =>
      tabContextMenuItems(tab, { index: 0, tabCount: 2, activeKey }, translator)
        .filter((item) => item.shortcut !== undefined)
        .map((item) => [item.id, item.shortcut]);

    expect(shortcutsOf(tab.location.canonicalKey)).toEqual([
      ['close', 'Ctrl+W'],
      ['reopenClosed', 'Ctrl+Shift+T'],
    ]);
    expect(shortcutsOf('other.md')).toEqual([['reopenClosed', 'Ctrl+Shift+T']]);
  });

  it('offers to unpin a pinned tab', () => {
    const items = tabContextMenuItems({ ...tab, isPinned: true }, { index: 0, tabCount: 2 }, translator);

    expect(items.map((item) => item.id)).toContain('unpin');
    expect(items.map((item) => item.id)).not.toContain('pin');
  });

  it('turns a chosen item into a command for that tab', () => {
    expect(commandForTabMenuItem('closeOthers', 'key')).toEqual({
      kind: 'closeOtherTabs',
      canonicalKey: 'key',
    });
    expect(commandForTabMenuItem('reopenClosed', 'key')).toEqual({ kind: 'reopenClosedTab' });
  });
});
