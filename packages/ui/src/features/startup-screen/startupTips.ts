import type { MessageKey, Translator } from '@mdx/i18n';
import { shortcutLabelFor } from '../shortcuts/commandShortcuts';
import type { ViewerCommand } from '../viewer/viewerCommands';

export interface StartupTip {
  readonly messageKey: MessageKey;
  /** The command whose shortcut fills the tip's `{shortcut}` placeholder. */
  readonly command?: ViewerCommand;
}

export const STARTUP_TIPS: readonly StartupTip[] = [
  { messageKey: 'startup.tip.commandPalette', command: { kind: 'showCommandPalette' } },
  { messageKey: 'startup.tip.findInFolders', command: { kind: 'showFolderSearch' } },
  { messageKey: 'startup.tip.reopenClosedTab', command: { kind: 'reopenClosedTab' } },
  { messageKey: 'startup.tip.favourite', command: { kind: 'toggleFavourite' } },
  { messageKey: 'startup.tip.editing', command: { kind: 'toggleEditing' } },
  { messageKey: 'startup.tip.previewBesideEditor', command: { kind: 'togglePreviewBesideEditor' } },
  { messageKey: 'startup.tip.outline', command: { kind: 'toggleOutline' } },
  { messageKey: 'startup.tip.sourceView', command: { kind: 'toggleSourceView' } },
  { messageKey: 'startup.tip.keyboardShortcuts', command: { kind: 'showKeyboardShortcuts' } },
  { messageKey: 'startup.tip.settings', command: { kind: 'showSettings' } },
  { messageKey: 'startup.tip.liveReload' },
  { messageKey: 'startup.tip.privacy' },
];

export function startupTipText({ messageKey, command }: StartupTip, translator: Translator): string {
  const shortcut = command ? shortcutLabelFor(command, translator) : undefined;
  return translator.translate(messageKey, shortcut === undefined ? undefined : { shortcut });
}

/** Where the rotation starts, so each start shows a different tip first. */
export function firstStartupTipIndex(randomFraction: number): number {
  return Math.floor(randomFraction * STARTUP_TIPS.length) % STARTUP_TIPS.length;
}
