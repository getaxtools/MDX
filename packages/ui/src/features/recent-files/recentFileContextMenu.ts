import type { RecentFile } from '@mdx/core';
import type { Translator } from '@mdx/i18n';
import type { ContextMenuItem } from '../../components/ContextMenuItem';
import {
  commandForPathMenuItem,
  isPathMenuItem,
  pathMenuItems,
  type PathCommand,
  type PathMenuItemId,
} from '../file-paths/pathCommands';
import type { LocateRecentFileCommand, RecentFileCommand } from './recentFileCommands';

export type RecentFileMenuItemId =
  'open' | 'locate' | 'pin' | 'unpin' | 'remove' | 'clearUnpinned' | PathMenuItemId;

export function recentFileContextMenuItems(
  recentFile: RecentFile,
  translator: Translator,
  { isAvailable = true }: { readonly isAvailable?: boolean } = {},
): ContextMenuItem<RecentFileMenuItemId>[] {
  return [
    { id: 'open', label: translator.translate('sidebar.open') },
    ...(isAvailable ? [] : [{ id: 'locate' as const, label: translator.translate('recentFiles.locate') }]),
    ...pathMenuItems(translator, { isAvailable }),
    recentFile.isPinned
      ? { id: 'unpin', label: translator.translate('recentFiles.unpin'), hasSeparatorBefore: true }
      : { id: 'pin', label: translator.translate('recentFiles.pin'), hasSeparatorBefore: true },
    { id: 'remove', label: translator.translate('recentFiles.remove') },
    {
      id: 'clearUnpinned',
      label: translator.translate('recentFiles.clearUnpinned'),
      hasSeparatorBefore: true,
    },
  ];
}

export function commandForRecentFileMenuItem(
  itemId: Exclude<RecentFileMenuItemId, 'open'>,
  recentFile: RecentFile,
): RecentFileCommand | LocateRecentFileCommand | PathCommand {
  if (isPathMenuItem(itemId)) return commandForPathMenuItem(itemId, recentFile.location.displayPath);
  const { canonicalKey } = recentFile.location;
  const commands: Record<
    Exclude<RecentFileMenuItemId, 'open' | PathMenuItemId>,
    RecentFileCommand | LocateRecentFileCommand
  > = {
    locate: { kind: 'locateRecentFile', canonicalKey },
    pin: { kind: 'pinRecentFile', canonicalKey },
    unpin: { kind: 'unpinRecentFile', canonicalKey },
    remove: { kind: 'removeRecentFile', canonicalKey },
    clearUnpinned: { kind: 'clearUnpinnedRecentFiles' },
  };
  return commands[itemId];
}
