import type { FavouriteGroup } from '@mdx/core';
import type { Translator } from '@mdx/i18n';
import type { ContextMenuItem } from '../../components/ContextMenuItem';
import { describeCombination } from '../shortcuts/describeCombination';

const MOVE_TO_GROUP_PREFIX = 'moveToGroup:';

export type FavouriteMenuItemId =
  | 'open'
  | 'rename'
  | 'moveUp'
  | 'moveDown'
  | 'moveToNewGroup'
  | `${typeof MOVE_TO_GROUP_PREFIX}${string}`
  | 'removeFromGroup'
  | 'refresh'
  | 'remove';

export type FavouriteGroupMenuItemId = 'renameGroup' | 'removeGroup';

export type FavouritesHeaderMenuItemId =
  'addFolderFavourite' | 'newGroup' | 'refreshFolders' | 'exportFavourites' | 'importFavourites';

export interface FavouriteMenuState {
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly groups: readonly FavouriteGroup[];
  readonly groupId: string | undefined;
  readonly isFolder: boolean;
}

export function favouriteContextMenuItems(
  { canMoveUp, canMoveDown, groups, groupId, isFolder }: FavouriteMenuState,
  translator: Translator,
): ContextMenuItem<FavouriteMenuItemId>[] {
  return [
    { id: 'open', label: translator.translate('sidebar.open') },
    ...(isFolder
      ? [{ id: 'refresh' as const, label: translator.translate('favourites.folder.refresh') }]
      : []),
    {
      id: 'rename',
      label: translator.translate('favourites.rename'),
      shortcut: describeCombination(['F2'], translator),
    },
    {
      id: 'moveUp',
      label: translator.translate('favourites.moveUp'),
      isDisabled: !canMoveUp,
      hasSeparatorBefore: true,
      shortcut: describeCombination(['alt', '↑'], translator),
    },
    {
      id: 'moveDown',
      label: translator.translate('favourites.moveDown'),
      isDisabled: !canMoveDown,
      shortcut: describeCombination(['alt', '↓'], translator),
    },
    ...groupMoveItems(groups, groupId, translator),
    {
      id: 'remove',
      label: translator.translate('favourites.remove'),
      hasSeparatorBefore: true,
      shortcut: describeCombination(['Delete'], translator),
    },
  ];
}

function groupMoveItems(
  groups: readonly FavouriteGroup[],
  groupId: string | undefined,
  translator: Translator,
): ContextMenuItem<FavouriteMenuItemId>[] {
  const otherGroups = groups.filter((group) => group.id !== groupId);
  return [
    {
      id: 'moveToNewGroup',
      label: translator.translate('favourites.group.moveToNew'),
      hasSeparatorBefore: true,
    },
    ...otherGroups.map((group) => ({
      id: `${MOVE_TO_GROUP_PREFIX}${group.id}` as const,
      label: translator.translate('favourites.group.moveTo', { name: group.name }),
    })),
    ...(groupId === undefined
      ? []
      : [{ id: 'removeFromGroup' as const, label: translator.translate('favourites.group.removeFrom') }]),
  ];
}

/** The group a "Move to …" item points at, or undefined for any other item. */
export function groupIdOfMenuItem(itemId: FavouriteMenuItemId): string | undefined {
  return itemId.startsWith(MOVE_TO_GROUP_PREFIX) ? itemId.slice(MOVE_TO_GROUP_PREFIX.length) : undefined;
}

export function favouriteGroupContextMenuItems(
  translator: Translator,
): ContextMenuItem<FavouriteGroupMenuItemId>[] {
  return [
    {
      id: 'renameGroup',
      label: translator.translate('favourites.group.rename'),
      shortcut: describeCombination(['F2'], translator),
    },
    {
      id: 'removeGroup',
      label: translator.translate('favourites.group.remove'),
      shortcut: describeCombination(['Delete'], translator),
    },
  ];
}

export function favouritesHeaderMenuItems(
  translator: Translator,
): ContextMenuItem<FavouritesHeaderMenuItemId>[] {
  return [
    { id: 'addFolderFavourite', label: translator.translate('favourites.addFolder') },
    { id: 'newGroup', label: translator.translate('favourites.group.new') },
    { id: 'refreshFolders', label: translator.translate('favourites.folder.refreshAll') },
    {
      id: 'exportFavourites',
      label: translator.translate('menu.file.exportFavourites'),
      hasSeparatorBefore: true,
    },
    { id: 'importFavourites', label: translator.translate('menu.file.importFavourites') },
  ];
}
