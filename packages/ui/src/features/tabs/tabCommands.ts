import type { Tab, TabStrip } from '@mdx/core';

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
  | { readonly kind: 'moveActiveTab'; readonly step: -1 | 1 }
  | { readonly kind: 'togglePinActiveTab' }
  | { readonly kind: 'closeInactiveTabs' }
  | { readonly kind: 'closeTabsRightOfActive' };

type TabCommandHandlers = {
  readonly [Kind in TabCommand['kind']]: (
    tabStrip: TabStrip,
    command: Extract<TabCommand, { kind: Kind }>,
  ) => TabStrip;
};

function withActiveTab(tabStrip: TabStrip, change: (activeTab: Tab) => TabStrip): TabStrip {
  const activeTab = tabStrip.activeTab();
  return activeTab ? change(activeTab) : tabStrip;
}

const TAB_COMMAND_HANDLERS: TabCommandHandlers = {
  closeActiveTab: (tabStrip) => withActiveTab(tabStrip, (tab) => tabStrip.close(tab.location.canonicalKey)),
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
  togglePinActiveTab: (tabStrip) =>
    withActiveTab(tabStrip, ({ location, isPinned }) =>
      isPinned ? tabStrip.unpin(location.canonicalKey) : tabStrip.pin(location.canonicalKey),
    ),
  closeInactiveTabs: (tabStrip) =>
    withActiveTab(tabStrip, (tab) => tabStrip.closeOthers(tab.location.canonicalKey)),
  closeTabsRightOfActive: (tabStrip) =>
    withActiveTab(tabStrip, (tab) => tabStrip.closeToTheRight(tab.location.canonicalKey)),
};

export function isTabCommand(command: { readonly kind: string }): command is TabCommand {
  return Object.hasOwn(TAB_COMMAND_HANDLERS, command.kind);
}

export function applyTabCommand(tabStrip: TabStrip, command: TabCommand): TabStrip {
  const handler = TAB_COMMAND_HANDLERS[command.kind] as (tabStrip: TabStrip, command: TabCommand) => TabStrip;
  return handler(tabStrip, command);
}
