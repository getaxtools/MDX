import type { Tab } from '@mdx/core';
import type { Translator } from '@mdx/i18n';
import type { ContextMenuItem } from '../../components/ContextMenuItem';
import { shortcutLabelFor } from '../shortcuts/commandShortcuts';
import type { TabCommand } from './tabCommands';

export type TabMenuItemId = 'close' | 'closeOthers' | 'closeToTheRight' | 'pin' | 'unpin' | 'reopenClosed';

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

export function commandForTabMenuItem(itemId: TabMenuItemId, canonicalKey: string): TabCommand {
  const commands: Record<TabMenuItemId, TabCommand> = {
    close: { kind: 'closeTab', canonicalKey },
    closeOthers: { kind: 'closeOtherTabs', canonicalKey },
    closeToTheRight: { kind: 'closeTabsToTheRight', canonicalKey },
    pin: { kind: 'pinTab', canonicalKey },
    unpin: { kind: 'unpinTab', canonicalKey },
    reopenClosed: { kind: 'reopenClosedTab' },
  };
  return commands[itemId];
}
