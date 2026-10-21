<script lang="ts">
  import type { Tab } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import { isUntitledLocation, type PathStatus } from '@mdx/platform';
  import ContextMenu from '../../components/ContextMenu.svelte';
  import { contextMenuPosition, isContextMenuKey } from '../../components/ContextMenuItem';
  import { logicalArrowKey } from '../../components/textDirection';
  import type { PathCommand } from '../file-paths/pathCommands';
  import type { TabCommand } from './tabCommands';
  import { commandForTabMenuItem, tabContextMenuItems, type TabMenuItemId } from './tabContextMenu';

  interface Props {
    tabs: readonly Tab[];
    activeKey: string | undefined;
    pathStatuses?: ReadonlyMap<string, PathStatus>;
    unsavedKeys?: ReadonlySet<string>;
    translator: Translator;
    onActivate: (canonicalKey: string) => void;
    onCommand: (command: TabCommand | PathCommand) => void;
  }

  const {
    tabs,
    activeKey,
    pathStatuses = new Map(),
    unsavedKeys = new Set(),
    translator,
    onActivate,
    onCommand,
  }: Props = $props();

  function isMissing(tab: Tab): boolean {
    return pathStatuses.get(tab.location.canonicalKey) === 'missing';
  }

  function labelOf(tab: Tab): string {
    const { fileName } = tab.location;
    if (isMissing(tab)) return translator.translate('tabs.status.missing', { fileName });
    if (isUntitledLocation(tab.location)) return translator.translate('tabs.status.notSaved', { fileName });
    return fileName;
  }

  const PRIMARY_MOUSE_BUTTON = 0;
  const MIDDLE_MOUSE_BUTTON = 1;
  let tabButtons: HTMLButtonElement[] = $state([]);
  let menuRequest: { readonly index: number; readonly x: number; readonly y: number } | undefined = $state();
  let draggedKey: string | undefined;
  let dropIndex: number | undefined;

  const menuTab = $derived(menuRequest ? tabs[menuRequest.index] : undefined);

  function focusTab(index: number) {
    const wrappedIndex = (index + tabs.length) % tabs.length;
    const tab = tabs[wrappedIndex];
    if (!tab) return;
    onActivate(tab.location.canonicalKey);
    tabButtons[wrappedIndex]?.focus();
  }

  function handleKeydown(event: KeyboardEvent, index: number) {
    if (isContextMenuKey(event)) {
      openMenu(event, index);
      return;
    }
    const moves: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: -1 };
    const target =
      event.currentTarget instanceof Element
        ? moves[logicalArrowKey(event.key, event.currentTarget)]
        : undefined;
    if (target === undefined) return;
    event.preventDefault();
    focusTab(target);
  }

  function handleAuxClick(event: MouseEvent, canonicalKey: string) {
    if (event.button === MIDDLE_MOUSE_BUTTON) onCommand({ kind: 'closeTab', canonicalKey });
  }

  function openMenu(event: MouseEvent | KeyboardEvent, index: number) {
    event.preventDefault();
    menuRequest = { index, ...contextMenuPosition(event) };
  }

  function chooseMenuItem(itemId: TabMenuItemId) {
    if (menuTab) onCommand(commandForTabMenuItem(itemId, menuTab.location));
  }

  function closeMenu() {
    const index = menuRequest?.index;
    menuRequest = undefined;
    if (index !== undefined) tabButtons[index]?.focus();
  }

  // Native drag and drop is unavailable while the window accepts dropped files, so tabs are moved with pointer events.
  function startDrag(event: PointerEvent, canonicalKey: string) {
    if (event.button !== PRIMARY_MOUSE_BUTTON) return;
    draggedKey = canonicalKey;
    dropIndex = undefined;
  }

  function markDropTarget(index: number) {
    if (draggedKey !== undefined) dropIndex = index;
  }

  function finishDrag() {
    const canonicalKey = draggedKey;
    const toIndex = dropIndex;
    draggedKey = undefined;
    dropIndex = undefined;
    if (canonicalKey === undefined || toIndex === undefined) return;
    const fromIndex = tabs.findIndex((tab) => tab.location.canonicalKey === canonicalKey);
    if (toIndex !== fromIndex) onCommand({ kind: 'moveTab', canonicalKey, toIndex });
  }
</script>

<svelte:window onpointerup={finishDrag} />

<div class="tab-strip" data-focus-region role="tablist" aria-label={translator.translate('tabs.label')}>
  {#each tabs as tab, index (tab.location.canonicalKey)}
    {@const isActive = tab.location.canonicalKey === activeKey}
    <div
      class="tab"
      class:active={isActive}
      class:pinned={tab.isPinned}
      class:missing={isMissing(tab)}
      role="presentation"
      onpointerenter={() => markDropTarget(index)}
    >
      <button
        bind:this={tabButtons[index]}
        class="tab-label"
        role="tab"
        aria-selected={isActive}
        tabindex={isActive ? 0 : -1}
        title={isMissing(tab)
          ? translator.translate('tabs.status.missing', { fileName: tab.location.displayPath })
          : tab.location.displayPath}
        onclick={() => onActivate(tab.location.canonicalKey)}
        onkeydown={(event) => handleKeydown(event, index)}
        onauxclick={(event) => handleAuxClick(event, tab.location.canonicalKey)}
        oncontextmenu={(event) => openMenu(event, index)}
        onpointerdown={(event) => startDrag(event, tab.location.canonicalKey)}
      >
        {#if tab.isPinned}<span class="pin" aria-hidden="true">📌</span>{/if}
        {labelOf(tab)}
        {#if unsavedKeys.has(tab.location.canonicalKey)}
          <span class="unsaved-dot" aria-hidden="true">●</span>
          <span class="visually-hidden">{translator.translate('tabs.status.unsavedHint')}</span>
        {/if}
      </button>
      <!-- A tab list may only contain tabs, so keyboard and screen reader users close tabs with Ctrl+W instead. -->
      <button
        class="tab-close"
        tabindex="-1"
        aria-hidden="true"
        title={translator.translate('tabs.closeTab', { fileName: tab.location.fileName })}
        onclick={() => onCommand({ kind: 'closeTab', canonicalKey: tab.location.canonicalKey })}
      >
        ×
      </button>
    </div>
  {/each}
</div>
{#if menuRequest && menuTab}
  <ContextMenu
    label={translator.translate('tabs.contextMenu.label', { fileName: menuTab.location.fileName })}
    items={tabContextMenuItems(
      menuTab,
      { index: menuRequest.index, tabCount: tabs.length, activeKey },
      translator,
    )}
    position={menuRequest}
    onChoose={chooseMenuItem}
    onClose={closeMenu}
  />
{/if}

<style>
  .tab-strip {
    display: flex;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2) 0;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    overflow-x: auto;
  }

  .tab {
    display: flex;
    align-items: center;
    border-radius: var(--radius-medium) var(--radius-medium) 0 0;
    max-width: 220px;
  }

  .tab.active {
    background: var(--color-background);
    box-shadow: inset 0 2px 0 var(--color-accent);
  }

  .tab:not(.active):hover {
    background: var(--color-surface-hover);
  }

  .tab-label,
  .tab-close {
    border: 0;
    background: none;
    color: var(--color-text);
    font: inherit;
    font-size: var(--text-size-body);
    cursor: default;
  }

  .tab-label {
    padding: var(--space-2) var(--space-1) var(--space-2) var(--space-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tab.missing .tab-label {
    color: var(--color-text-secondary);
    text-decoration: line-through;
  }

  .pin {
    font-size: 0.75em;
  }

  .tab-close {
    padding: var(--space-1) var(--space-2);
    color: var(--color-text-secondary);
    border-radius: var(--radius-small);
  }

  .tab-close:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  button:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: -2px;
  }

  .unsaved-dot {
    margin-inline-start: var(--space-1);
    color: var(--color-accent);
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
