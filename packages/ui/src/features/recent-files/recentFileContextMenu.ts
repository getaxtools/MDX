import type { RecentFile } from '@mdx/core';
import type { Translator } from '@mdx/i18n';
import type { ContextMenuItem } from '../../components/ContextMenuItem';
import type { RecentFileCommand } from './recentFileCommands';

export type RecentFileMenuItemId = 'open' | 'pin' | 'unpin' | 'remove' | 'clearUnpinned';

export function recentFileContextMenuItems(
  recentFile: RecentFile,
  translator: Translator,
): ContextMenuItem<RecentFileMenuItemId>[] {
  return [
    { id: 'open', label: translator.translate('sidebar.open') },
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
  canonicalKey: string,
): RecentFileCommand {
  const commands: Record<Exclude<RecentFileMenuItemId, 'open'>, RecentFileCommand> = {
    pin: { kind: 'pinRecentFile', canonicalKey },
    unpin: { kind: 'unpinRecentFile', canonicalKey },
    remove: { kind: 'removeRecentFile', canonicalKey },
    clearUnpinned: { kind: 'clearUnpinnedRecentFiles' },
  };
  return commands[itemId];
}
