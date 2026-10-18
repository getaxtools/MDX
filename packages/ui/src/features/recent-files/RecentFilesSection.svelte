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
  import type { RecentFileCommand } from './recentFileCommands';

  interface Props {
    recentFiles: readonly RecentFile[];
    pathStatuses: ReadonlyMap<string, PathStatus>;
    translator: Translator;
    onOpen: (recentFile: RecentFile) => void;
    onCommand: (command: RecentFileCommand) => void;
  }

  const { recentFiles, pathStatuses, translator, onOpen, onCommand }: Props = $props();

  let itemButtons: HTMLButtonElement[] = $state([]);
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
    if (isContextMenuKey(event)) openMenu(event, index);
  }

  function chooseMenuItem(itemId: RecentFileMenuItemId) {
    if (!menuRecentFile) return;
    if (itemId === 'open') onOpen(menuRecentFile);
    else onCommand(commandForRecentFileMenuItem(itemId, menuRecentFile.location.canonicalKey));
  }

  function closeMenu() {
    const index = menuRequest?.index;
    menuRequest = undefined;
    if (index !== undefined) itemButtons[index]?.focus();
  }
</script>

<section aria-labelledby="recent-files-heading">
  <h2 id="recent-files-heading">{translator.translate('recentFiles.title')}</h2>
  {#if recentFiles.length === 0}
    <p class="empty-state">{translator.translate('recentFiles.emptyState')}</p>
  {:else}
    <ul>
      {#each recentFiles as recentFile, index (recentFile.location.canonicalKey)}
        <li>
          <button
            bind:this={itemButtons[index]}
            class:unavailable={statusOf(recentFile) !== 'available'}
            title={recentFile.location.displayPath}
            onclick={() => onOpen(recentFile)}
            onkeydown={(event) => handleKeydown(event, index)}
            oncontextmenu={(event) => openMenu(event, index)}
          >
            {#if recentFile.isPinned}<span aria-hidden="true">📌</span>{/if}
            {labelOf(recentFile)}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>
{#if menuRequest && menuRecentFile}
  <ContextMenu
    label={translator.translate('recentFiles.contextMenu.label', {
      fileName: menuRecentFile.location.fileName,
    })}
    items={recentFileContextMenuItems(menuRecentFile, translator)}
    position={menuRequest}
    onChoose={chooseMenuItem}
    onClose={closeMenu}
  />
{/if}
