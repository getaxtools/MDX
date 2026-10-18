import type { RecentFilesList } from '@mdx/core';

export type RecentFileCommand =
  | { readonly kind: 'pinRecentFile'; readonly canonicalKey: string }
  | { readonly kind: 'unpinRecentFile'; readonly canonicalKey: string }
  | { readonly kind: 'removeRecentFile'; readonly canonicalKey: string }
  | { readonly kind: 'clearUnpinnedRecentFiles' };

type RecentFileCommandHandlers = {
  readonly [Kind in RecentFileCommand['kind']]: (
    recentFiles: RecentFilesList,
    command: Extract<RecentFileCommand, { kind: Kind }>,
  ) => RecentFilesList;
};

const RECENT_FILE_COMMAND_HANDLERS: RecentFileCommandHandlers = {
  pinRecentFile: (recentFiles, { canonicalKey }) => recentFiles.pin(canonicalKey),
  unpinRecentFile: (recentFiles, { canonicalKey }) => recentFiles.unpin(canonicalKey),
  removeRecentFile: (recentFiles, { canonicalKey }) => recentFiles.remove(canonicalKey),
  clearUnpinnedRecentFiles: (recentFiles) => recentFiles.clearUnpinned(),
};

export function isRecentFileCommand(command: { readonly kind: string }): command is RecentFileCommand {
  return Object.hasOwn(RECENT_FILE_COMMAND_HANDLERS, command.kind);
}

export function applyRecentFileCommand(
  recentFiles: RecentFilesList,
  command: RecentFileCommand,
): RecentFilesList {
  const handler = RECENT_FILE_COMMAND_HANDLERS[command.kind] as (
    recentFiles: RecentFilesList,
    command: RecentFileCommand,
  ) => RecentFilesList;
  return handler(recentFiles, command);
}
