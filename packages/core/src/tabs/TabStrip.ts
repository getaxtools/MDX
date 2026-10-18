import type { DocumentLocation } from '@mdx/platform';

export const MAX_REOPENABLE_TABS = 20;
export const LAST_TAB_NUMBER_KEY = 9;

export interface Tab {
  readonly location: DocumentLocation;
  readonly isPinned: boolean;
  readonly scrollRatio: number;
}

export interface TabStripSnapshot {
  readonly tabs: readonly Tab[];
  readonly activeKey?: string;
}

export class TabStrip {
  private constructor(
    private readonly orderedTabs: readonly Tab[],
    private readonly activeKey: string | undefined,
    private readonly recentlyClosed: readonly Tab[],
  ) {}

  static empty(): TabStrip {
    return new TabStrip([], undefined, []);
  }

  static fromSnapshot(snapshot: TabStripSnapshot): TabStrip {
    const uniqueTabs = snapshot.tabs.filter(
      (tab, index) => snapshot.tabs.findIndex((other) => keyOf(other) === keyOf(tab)) === index,
    );
    const orderedTabs = [
      ...uniqueTabs.filter((tab) => tab.isPinned),
      ...uniqueTabs.filter((tab) => !tab.isPinned),
    ];
    const isActiveKeyOpen = orderedTabs.some((tab) => keyOf(tab) === snapshot.activeKey);
    const activeKey = isActiveKeyOpen ? snapshot.activeKey : orderedTabs[0]?.location.canonicalKey;
    return new TabStrip(orderedTabs, activeKey, []);
  }

  toSnapshot(): TabStripSnapshot {
    return this.activeKey === undefined
      ? { tabs: this.orderedTabs }
      : { tabs: this.orderedTabs, activeKey: this.activeKey };
  }

  tabs(): readonly Tab[] {
    return this.orderedTabs;
  }

  activeTab(): Tab | undefined {
    return this.orderedTabs.find((tab) => keyOf(tab) === this.activeKey);
  }

  isOpen(canonicalKey: string): boolean {
    return this.indexOf(canonicalKey) !== -1;
  }

  openOrFocus(location: DocumentLocation): TabStrip {
    if (this.isOpen(location.canonicalKey)) return this.activate(location.canonicalKey);
    const insertAt = Math.max(this.indexOf(this.activeKey) + 1, pinnedCountOf(this.orderedTabs));
    const newTab: Tab = { location, isPinned: false, scrollRatio: 0 };
    return new TabStrip(
      insertTabAt(this.orderedTabs, newTab, insertAt),
      location.canonicalKey,
      this.recentlyClosed,
    );
  }

  activate(canonicalKey: string): TabStrip {
    if (!this.isOpen(canonicalKey)) return this;
    return new TabStrip(this.orderedTabs, canonicalKey, this.recentlyClosed);
  }

  activateNext(): TabStrip {
    return this.activateRelative(1);
  }

  activatePrevious(): TabStrip {
    return this.activateRelative(-1);
  }

  activateByNumberKey(numberKey: number): TabStrip {
    const tab = numberKey === LAST_TAB_NUMBER_KEY ? this.orderedTabs.at(-1) : this.orderedTabs[numberKey - 1];
    return tab ? this.activate(keyOf(tab)) : this;
  }

  close(canonicalKey: string): TabStrip {
    const index = this.indexOf(canonicalKey);
    const closingTab = this.orderedTabs[index];
    if (!closingTab) return this;
    const remainingTabs = this.orderedTabs.filter((tab) => tab !== closingTab);
    const nextActiveTab = remainingTabs[index] ?? remainingTabs[index - 1];
    const activeKey = canonicalKey === this.activeKey ? nextActiveTab?.location.canonicalKey : this.activeKey;
    return new TabStrip(remainingTabs, activeKey, rememberClosed(this.recentlyClosed, [closingTab]));
  }

  closeOthers(canonicalKey: string): TabStrip {
    if (!this.isOpen(canonicalKey)) return this;
    return this.closeWhere((tab) => keyOf(tab) !== canonicalKey, canonicalKey);
  }

  closeToTheRight(canonicalKey: string): TabStrip {
    const index = this.indexOf(canonicalKey);
    if (index === -1) return this;
    return this.closeWhere((tab) => this.indexOf(keyOf(tab)) > index, canonicalKey);
  }

  reopenLastClosed(): TabStrip {
    const [lastClosedTab, ...olderClosedTabs] = this.recentlyClosed;
    if (!lastClosedTab) return this;
    const reopened = this.isOpen(keyOf(lastClosedTab))
      ? this
      : new TabStrip(
          insertAtEndOfRegion(this.orderedTabs, lastClosedTab),
          this.activeKey,
          this.recentlyClosed,
        );
    return new TabStrip(reopened.orderedTabs, keyOf(lastClosedTab), olderClosedTabs);
  }

  move(canonicalKey: string, toIndex: number): TabStrip {
    const movingTab = this.orderedTabs.find((tab) => keyOf(tab) === canonicalKey);
    if (!movingTab) return this;
    const otherTabs = this.orderedTabs.filter((tab) => tab !== movingTab);
    const pinnedCount = pinnedCountOf(otherTabs);
    const [regionStart, regionEnd] = movingTab.isPinned ? [0, pinnedCount] : [pinnedCount, otherTabs.length];
    const clampedIndex = Math.min(Math.max(toIndex, regionStart), regionEnd);
    return new TabStrip(insertTabAt(otherTabs, movingTab, clampedIndex), this.activeKey, this.recentlyClosed);
  }

  /** Shows another document in a tab, as after Save As; focuses that document's tab if it is already open. */
  replace(canonicalKey: string, location: DocumentLocation): TabStrip {
    const replacedTab = this.orderedTabs.find((tab) => keyOf(tab) === canonicalKey);
    if (!replacedTab || canonicalKey === location.canonicalKey) return this;
    const wasActive = this.activeKey === canonicalKey;
    if (this.isOpen(location.canonicalKey)) {
      const remainingTabs = this.orderedTabs.filter((tab) => tab !== replacedTab);
      return new TabStrip(
        remainingTabs,
        wasActive ? location.canonicalKey : this.activeKey,
        this.recentlyClosed,
      );
    }
    const updatedTabs = this.orderedTabs.map((tab) => (tab === replacedTab ? { ...tab, location } : tab));
    return new TabStrip(updatedTabs, wasActive ? location.canonicalKey : this.activeKey, this.recentlyClosed);
  }

  pin(canonicalKey: string): TabStrip {
    return this.withPinnedState(canonicalKey, true);
  }

  unpin(canonicalKey: string): TabStrip {
    return this.withPinnedState(canonicalKey, false);
  }

  updateScrollRatio(canonicalKey: string, scrollRatio: number): TabStrip {
    const clampedRatio = Math.min(Math.max(scrollRatio, 0), 1);
    const updatedTabs = this.orderedTabs.map((tab) =>
      keyOf(tab) === canonicalKey ? { ...tab, scrollRatio: clampedRatio } : tab,
    );
    return new TabStrip(updatedTabs, this.activeKey, this.recentlyClosed);
  }

  private indexOf(canonicalKey: string | undefined): number {
    return this.orderedTabs.findIndex((tab) => keyOf(tab) === canonicalKey);
  }

  private activateRelative(step: number): TabStrip {
    const count = this.orderedTabs.length;
    if (count === 0) return this;
    const nextIndex = (this.indexOf(this.activeKey) + step + count) % count;
    const nextTab = this.orderedTabs[nextIndex];
    return nextTab ? this.activate(keyOf(nextTab)) : this;
  }

  private closeWhere(shouldClose: (tab: Tab) => boolean, keyToActivate: string): TabStrip {
    const closingTabs = this.orderedTabs.filter((tab) => !tab.isPinned && shouldClose(tab));
    const remainingTabs = this.orderedTabs.filter((tab) => !closingTabs.includes(tab));
    const isActiveTabClosed = closingTabs.some((tab) => keyOf(tab) === this.activeKey);
    const activeKey = isActiveTabClosed ? keyToActivate : this.activeKey;
    return new TabStrip(remainingTabs, activeKey, rememberClosed(this.recentlyClosed, closingTabs));
  }

  private withPinnedState(canonicalKey: string, isPinned: boolean): TabStrip {
    const tab = this.orderedTabs.find((candidate) => keyOf(candidate) === canonicalKey);
    if (!tab || tab.isPinned === isPinned) return this;
    const otherTabs = this.orderedTabs.filter((candidate) => candidate !== tab);
    const updatedTabs = insertTabAt(otherTabs, { ...tab, isPinned }, pinnedCountOf(otherTabs));
    return new TabStrip(updatedTabs, this.activeKey, this.recentlyClosed);
  }
}

function keyOf(tab: Tab): string {
  return tab.location.canonicalKey;
}

function pinnedCountOf(tabs: readonly Tab[]): number {
  return tabs.filter((tab) => tab.isPinned).length;
}

function insertTabAt(tabs: readonly Tab[], tab: Tab, index: number): readonly Tab[] {
  return [...tabs.slice(0, index), tab, ...tabs.slice(index)];
}

function insertAtEndOfRegion(tabs: readonly Tab[], tab: Tab): readonly Tab[] {
  return tab.isPinned ? insertTabAt(tabs, tab, pinnedCountOf(tabs)) : [...tabs, tab];
}

function rememberClosed(recentlyClosed: readonly Tab[], closedTabs: readonly Tab[]): readonly Tab[] {
  return [...closedTabs, ...recentlyClosed].slice(0, MAX_REOPENABLE_TABS);
}
