import { createTranslator } from '@mdx/i18n';
import { InMemoryDocumentFiles } from '@mdx/platform';
import { describe, expect, it } from 'vitest';
import { commandForRecentFileMenuItem, recentFileContextMenuItems } from './recentFileContextMenu';

const translator = createTranslator();
const recentFile = { location: InMemoryDocumentFiles.locationOf('a.md'), isPinned: false, lastOpenedAtMs: 1 };

describe('recent file context menu', () => {
  it('offers Locate only for a file that is missing or out of reach', () => {
    const availableIds = recentFileContextMenuItems(recentFile, translator).map((item) => item.id);
    const missingIds = recentFileContextMenuItems(recentFile, translator, { isAvailable: false }).map(
      (item) => item.id,
    );

    expect(availableIds).not.toContain('locate');
    expect(missingIds).toEqual([
      'open',
      'locate',
      'copyPath',
      'revealInFileManager',
      'pin',
      'remove',
      'clearUnpinned',
    ]);
  });

  it('turns Locate into a command for that file', () => {
    expect(commandForRecentFileMenuItem('locate', recentFile)).toEqual({
      kind: 'locateRecentFile',
      canonicalKey: recentFile.location.canonicalKey,
    });
    expect(commandForRecentFileMenuItem('copyPath', recentFile)).toEqual({
      kind: 'copyPath',
      path: recentFile.location.displayPath,
    });
  });
});
