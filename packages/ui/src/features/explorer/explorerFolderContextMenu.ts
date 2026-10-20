import type { Translator } from '@mdx/i18n';
import type { ContextMenuItem } from '../../components/ContextMenuItem';
import { describeCombination } from '../shortcuts/describeCombination';

export type ExplorerFolderMenuItemId = 'addToFavourites' | 'refresh' | 'remove';

export type ExplorerFoldersHeaderMenuItemId = 'openFolder' | 'refreshFolders';

export function explorerFolderContextMenuItems(
  { isFavourite }: { readonly isFavourite: boolean },
  translator: Translator,
): ContextMenuItem<ExplorerFolderMenuItemId>[] {
  return [
    {
      id: 'addToFavourites',
      label: translator.translate('explorer.folders.addToFavourites'),
      isDisabled: isFavourite,
    },
    { id: 'refresh', label: translator.translate('favourites.folder.refresh') },
    {
      id: 'remove',
      label: translator.translate('explorer.folders.remove'),
      hasSeparatorBefore: true,
      shortcut: describeCombination(['Delete'], translator),
    },
  ];
}

export function explorerFoldersHeaderMenuItems(
  translator: Translator,
): ContextMenuItem<ExplorerFoldersHeaderMenuItemId>[] {
  return [
    { id: 'openFolder', label: translator.translate('menu.file.openFolder') },
    { id: 'refreshFolders', label: translator.translate('favourites.folder.refreshAll') },
  ];
}
