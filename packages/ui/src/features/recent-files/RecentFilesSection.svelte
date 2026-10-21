<script lang="ts">
  import type { RecentFile } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import type { PathStatus } from '@mdx/platform';
  import ContextMenu from '../../components/ContextMenu.svelte';
  import { contextMenuPosition, isContextMenuKey } from '../../components/ContextMenuItem';
  import {
    commandForRecentFileMenuItem,
    recentFileContextMenuItems,
    type RecentFileMenuItemId,
  } from './recentFileContextMenu';
  import ExplorerSectionHeader from '../explorer/ExplorerSectionHeader.svelte';
  import TreeItemIcon from '../folder-tree/TreeItemIcon.svelte';
  import { activateWithKeyboard, treeKeyboard } from '../folder-tree/treeKeyboard';
  import type { PathCommand } from '../file-paths/pathCommands';
  import type { LocateRecentFileCommand, RecentFileCommand } from './recentFileCommands';

  interface Props {
    recentFiles: readonly RecentFile[];
    pathStatuses: ReadonlyMap<string, PathStatus>;
    translator: Translator;
    onOpen: (recentFile: RecentFile) => void;
    onCommand: (command: RecentFileCommand | LocateRecentFileCommand | PathCommand) => void;
    isExpanded?: boolean;
    onToggleExpanded?: () => void;
  }

  const {
    recentFiles,
    pathStatuses,
    translator,
    onOpen,
    onCommand,
    isExpanded = true,
    onToggleExpanded = () => undefined,
  }: Props = $props();

  let itemRows: HTMLElement[] = $state([]);
  let menuRequest: { readonly index: number; readonly x: number; readonly y: number } | undefined = $state();

  const menuRecentFile = $derived(menuRequest ? recentFiles[menuRequest.index] : undefined);

  function statusOf(recentFile: RecentFile): PathStatus {
    return pathStatuses.get(recentFile.location.canonicalKey) ?? 'available';
  }

  function labelOf(recentFile: RecentFile): string {
    const status = statusOf(recentFile);
    const { fileName } = recentFile.location;
    return status === 'available'
      ? fileName
      : translator.translate(`recentFiles.status.${status}`, { fileName });
  }

  function openMenu(event: MouseEvent | KeyboardEvent, index: number) {
    event.preventDefault();
    menuRequest = { index, ...contextMenuPosition(event) };
  }

  function handleKeydown(event: KeyboardEvent, index: number) {
    activateWithKeyboard(event);
    if (isContextMenuKey(event)) openMenu(event, index);
  }

  function chooseMenuItem(itemId: RecentFileMenuItemId) {
    if (!menuRecentFile) return;
    if (itemId === 'open') onOpen(menuRecentFile);
    else onCommand(commandForRecentFileMenuItem(itemId, menuRecentFile));
  }

  function closeMenu() {
    const index = menuRequest?.index;
    menuRequest = undefined;
    if (index !== undefined) itemRows[index]?.focus();
  }
</script>

<section aria-labelledby="recent-files-heading">
  <ExplorerSectionHeader
    headingId="recent-files-heading"
    title={translator.translate('recentFiles.title')}
    {isExpanded}
    onToggle={onToggleExpanded}
  />
  {#if isExpanded}
    {#if recentFiles.length === 0}
      <p class="empty-state">{translator.translate('recentFiles.emptyState')}</p>
    {:else}
      <ul role="tree" aria-labelledby="recent-files-heading" use:treeKeyboard>
        {#each recentFiles as recentFile, index (recentFile.location.canonicalKey)}
          <li role="none">
            <div
              bind:this={itemRows[index]}
              role="treeitem"
              aria-selected="false"
              tabindex="-1"
              aria-level="1"
              class:unavailable={statusOf(recentFile) !== 'available'}
              title={recentFile.location.displayPath}
              onclick={() => onOpen(recentFile)}
              onkeydown={(event) => handleKeydown(event, index)}
              oncontextmenu={(event) => openMenu(event, index)}
            >
              <TreeItemIcon kind="document" />
              <span class="name">{labelOf(recentFile)}</span>
              {#if recentFile.isPinned}<span class="pin" aria-hidden="true">📌</span>{/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</section>
{#if menuRequest && menuRecentFile}
  <ContextMenu
    label={translator.translate('recentFiles.contextMenu.label', {
      fileName: menuRecentFile.location.fileName,
    })}
    items={recentFileContextMenuItems(menuRecentFile, translator, {
      isAvailable: statusOf(menuRecentFile) === 'available',
    })}
    position={menuRequest}
    onChoose={chooseMenuItem}
    onClose={closeMenu}
  />
{/if}

<style>
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pin {
    margin-inline-start: auto;
    font-size: var(--text-size-small);
  }
</style>
