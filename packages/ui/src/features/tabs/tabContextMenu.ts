import type { Tab } from '@mdx/core';
import type { Translator } from '@mdx/i18n';
import { isUntitledLocation, type DocumentLocation } from '@mdx/platform';
import type { ContextMenuItem } from '../../components/ContextMenuItem';
import {
  commandForPathMenuItem,
  isPathMenuItem,
  pathMenuItems,
  type PathCommand,
  type PathMenuItemId,
} from '../file-paths/pathCommands';
import { shortcutLabelFor } from '../shortcuts/commandShortcuts';
import type { TabCommand } from './tabCommands';

export type TabMenuItemId =
  'close' | 'closeOthers' | 'closeToTheRight' | 'pin' | 'unpin' | 'reopenClosed' | PathMenuItemId;

export interface TabPosition {
  readonly index: number;
  readonly tabCount: number;
  readonly activeKey?: string | undefined;
}

export function tabContextMenuItems(
  tab: Tab,
  { index, tabCount, activeKey }: TabPosition,
  translator: Translator,
): ContextMenuItem<TabMenuItemId>[] {
  return [
    {
      id: 'close',
      label: translator.translate('tabs.close'),
      shortcut:
        tab.location.canonicalKey === activeKey
          ? shortcutLabelFor({ kind: 'closeActiveTab' }, translator)
          : undefined,
    },
    { id: 'closeOthers', label: translator.translate('tabs.closeOthers'), isDisabled: tabCount < 2 },
    {
      id: 'closeToTheRight',
      label: translator.translate('tabs.closeToTheRight'),
      isDisabled: index === tabCount - 1,
    },
    ...(isUntitledLocation(tab.location) ? [] : pathMenuItems(translator)),
    tab.isPinned
      ? { id: 'unpin', label: translator.translate('tabs.unpin'), hasSeparatorBefore: true }
      : { id: 'pin', label: translator.translate('tabs.pin'), hasSeparatorBefore: true },
    {
      id: 'reopenClosed',
      label: translator.translate('tabs.reopenClosed'),
      hasSeparatorBefore: true,
      shortcut: shortcutLabelFor({ kind: 'reopenClosedTab' }, translator),
    },
  ];
}

export function commandForTabMenuItem(
  itemId: TabMenuItemId,
  location: DocumentLocation,
): TabCommand | PathCommand {
  if (isPathMenuItem(itemId)) return commandForPathMenuItem(itemId, location.displayPath);
  const { canonicalKey } = location;
  const commands: Record<Exclude<TabMenuItemId, PathMenuItemId>, TabCommand> = {
    close: { kind: 'closeTab', canonicalKey },
    closeOthers: { kind: 'closeOtherTabs', canonicalKey },
    closeToTheRight: { kind: 'closeTabsToTheRight', canonicalKey },
    pin: { kind: 'pinTab', canonicalKey },
    unpin: { kind: 'unpinTab', canonicalKey },
    reopenClosed: { kind: 'reopenClosedTab' },
  };
  return commands[itemId];
}
