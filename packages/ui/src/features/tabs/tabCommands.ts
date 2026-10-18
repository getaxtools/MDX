import type { TabStrip } from '@mdx/core';

export type TabCommand =
  | { readonly kind: 'closeActiveTab' }
  | { readonly kind: 'nextTab' }
  | { readonly kind: 'previousTab' }
  | { readonly kind: 'activateTabNumber'; readonly numberKey: number }
  | { readonly kind: 'reopenClosedTab' }
  | { readonly kind: 'closeTab'; readonly canonicalKey: string }
  | { readonly kind: 'closeOtherTabs'; readonly canonicalKey: string }
  | { readonly kind: 'closeTabsToTheRight'; readonly canonicalKey: string }
  | { readonly kind: 'pinTab'; readonly canonicalKey: string }
  | { readonly kind: 'unpinTab'; readonly canonicalKey: string }
  | { readonly kind: 'moveTab'; readonly canonicalKey: string; readonly toIndex: number }
  | { readonly kind: 'moveActiveTab'; readonly step: -1 | 1 };

type TabCommandHandlers = {
  readonly [Kind in TabCommand['kind']]: (
    tabStrip: TabStrip,
    command: Extract<TabCommand, { kind: Kind }>,
  ) => TabStrip;
};

const TAB_COMMAND_HANDLERS: TabCommandHandlers = {
  closeActiveTab: (tabStrip) => {
    const activeTab = tabStrip.activeTab();
    return activeTab ? tabStrip.close(activeTab.location.canonicalKey) : tabStrip;
  },
  nextTab: (tabStrip) => tabStrip.activateNext(),
  previousTab: (tabStrip) => tabStrip.activatePrevious(),
  activateTabNumber: (tabStrip, { numberKey }) => tabStrip.activateByNumberKey(numberKey),
  reopenClosedTab: (tabStrip) => tabStrip.reopenLastClosed(),
  closeTab: (tabStrip, { canonicalKey }) => tabStrip.close(canonicalKey),
  closeOtherTabs: (tabStrip, { canonicalKey }) => tabStrip.closeOthers(canonicalKey),
  closeTabsToTheRight: (tabStrip, { canonicalKey }) => tabStrip.closeToTheRight(canonicalKey),
  pinTab: (tabStrip, { canonicalKey }) => tabStrip.pin(canonicalKey),
  unpinTab: (tabStrip, { canonicalKey }) => tabStrip.unpin(canonicalKey),
  moveTab: (tabStrip, { canonicalKey, toIndex }) => tabStrip.move(canonicalKey, toIndex),
  moveActiveTab: (tabStrip, { step }) => {
    const activeKey = tabStrip.activeTab()?.location.canonicalKey;
    if (activeKey === undefined) return tabStrip;
    const activeIndex = tabStrip.tabs().findIndex((tab) => tab.location.canonicalKey === activeKey);
    return tabStrip.move(activeKey, activeIndex + step);
  },
};

export function isTabCommand(command: { readonly kind: string }): command is TabCommand {
  return Object.hasOwn(TAB_COMMAND_HANDLERS, command.kind);
}

export function applyTabCommand(tabStrip: TabStrip, command: TabCommand): TabStrip {
  const handler = TAB_COMMAND_HANDLERS[command.kind] as (tabStrip: TabStrip, command: TabCommand) => TabStrip;
  return handler(tabStrip, command);
}
