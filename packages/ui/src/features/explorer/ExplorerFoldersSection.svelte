<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import type { DocumentLocation, FolderListing, PathStatus } from '@mdx/platform';
  import { SvelteSet } from 'svelte/reactivity';
  import ContextMenu from '../../components/ContextMenu.svelte';
  import { contextMenuPosition, isContextMenuKey } from '../../components/ContextMenuItem';
  import FolderContents from '../folder-tree/FolderContents.svelte';
  import type { FolderTreeCommand } from '../folder-tree/folderTreeCommands';
  import { isInsideFolder } from '../folder-tree/isInsideFolder';
  import { activateWithKeyboard, treeKeyboard } from '../folder-tree/treeKeyboard';
  import TreeChevron from '../folder-tree/TreeChevron.svelte';
  import TreeItemIcon from '../folder-tree/TreeItemIcon.svelte';
  import type { ExplorerActionCommand, RemoveExplorerFolderCommand } from './explorerCommands';
  import {
    explorerFolderContextMenuItems,
    explorerFoldersHeaderMenuItems,
    type ExplorerFolderMenuItemId,
    type ExplorerFoldersHeaderMenuItemId,
  } from './explorerFolderContextMenu';
  import ExplorerSectionHeader from './ExplorerSectionHeader.svelte';

  type ExplorerFoldersCommand =
    ExplorerActionCommand | RemoveExplorerFolderCommand | FolderTreeCommand | { readonly kind: 'openFolder' };

  interface Props {
    folders: readonly DocumentLocation[];
    favouriteKeys: ReadonlySet<string>;
    pathStatuses: ReadonlyMap<string, PathStatus>;
    translator: Translator;
    isExpanded: boolean;
    onToggleExpanded: () => void;
    folderRevisions: ReadonlyMap<string, number>;
    onListFolder: (folderPath: string) => Promise<FolderListing>;
    onShowFolder: (folderPath: string) => () => void;
    onOpenDocument: (documentPath: string) => void;
    onCommand: (command: ExplorerFoldersCommand) => void;
    activeDocumentKey?: string | undefined;
  }

  const {
    folders,
    favouriteKeys,
    pathStatuses,
    translator,
    isExpanded,
    onToggleExpanded,
    folderRevisions,
    onListFolder,
    onShowFolder,
    onOpenDocument,
    onCommand,
    activeDocumentKey,
  }: Props = $props();

  type MenuRequest =
    | { readonly kind: 'folder'; readonly index: number; readonly x: number; readonly y: number }
    | { readonly kind: 'header'; readonly x: number; readonly y: number };

  const collapsedFolderKeys = new SvelteSet<string>();
  let folderRows: HTMLElement[] = $state([]);
  let revealedDocumentKey: string | undefined;
  let menuRequest: MenuRequest | undefined = $state();

  const menuFolder = $derived(menuRequest?.kind === 'folder' ? folders[menuRequest.index] : undefined);

  $effect(() => {
    if (activeDocumentKey === revealedDocumentKey) return;
    revealedDocumentKey = activeDocumentKey;
    const key = activeDocumentKey;
    const root = key ? folders.find((folder) => isInsideFolder(key, folder.canonicalKey)) : undefined;
    if (root) collapsedFolderKeys.delete(root.canonicalKey);
  });

  function toggleFolder(canonicalKey: string) {
    if (collapsedFolderKeys.has(canonicalKey)) collapsedFolderKeys.delete(canonicalKey);
    else collapsedFolderKeys.add(canonicalKey);
  }

  function labelOf(folder: DocumentLocation): string {
    const status = pathStatuses.get(folder.canonicalKey) ?? 'available';
    const name = folder.fileName;
    return status === 'available'
      ? name
      : translator.translate(`explorer.folders.status.${status}`, { name });
  }

  function openMenu(
    event: MouseEvent | KeyboardEvent,
    target: { kind: 'folder'; index: number } | { kind: 'header' },
  ) {
    event.preventDefault();
    menuRequest = { ...target, ...contextMenuPosition(event) };
  }

  function handleKeydown(event: KeyboardEvent, index: number) {
    activateWithKeyboard(event);
    if (isContextMenuKey(event)) {
      openMenu(event, { kind: 'folder', index });
      return;
    }
    const folder = folders[index];
    if (event.key !== 'Delete' || !folder) return;
    event.preventDefault();
    onCommand({ kind: 'removeExplorerFolder', canonicalKey: folder.canonicalKey });
  }

  function chooseFolderItem(itemId: ExplorerFolderMenuItemId) {
    if (!menuFolder) return;
    const { canonicalKey } = menuFolder;
    if (itemId === 'addToFavourites') onCommand({ kind: 'addExplorerFolderToFavourites', canonicalKey });
    else if (itemId === 'refresh') onCommand({ kind: 'refreshFolders' });
    else onCommand({ kind: 'removeExplorerFolder', canonicalKey });
  }

  function chooseHeaderItem(itemId: ExplorerFoldersHeaderMenuItemId) {
    onCommand({ kind: itemId });
  }

  function closeMenu() {
    const request = menuRequest;
    menuRequest = undefined;
    if (request?.kind === 'folder') folderRows[request.index]?.focus();
  }
</script>

<section aria-labelledby="explorer-folders-heading">
  <ExplorerSectionHeader
    headingId="explorer-folders-heading"
    title={translator.translate('explorer.folders.title')}
    {isExpanded}
    onToggle={onToggleExpanded}
  >
    {#snippet actions()}
      <button
        class="header-menu"
        aria-label={translator.translate('explorer.folders.headerMenu.label')}
        title={translator.translate('explorer.folders.headerMenu.label')}
        aria-haspopup="menu"
        onclick={(event) => openMenu(event, { kind: 'header' })}
      >
        <span aria-hidden="true">⋯</span>
      </button>
    {/snippet}
  </ExplorerSectionHeader>
  {#if isExpanded}
    {#if folders.length === 0}
      <p class="empty-state">{translator.translate('explorer.folders.emptyState')}</p>
      <button class="open-folder" onclick={() => onCommand({ kind: 'openFolder' })}>
        {translator.translate('menu.file.openFolder')}
      </button>
    {:else}
      <ul role="tree" aria-labelledby="explorer-folders-heading" use:treeKeyboard>
        {#each folders as folder, index (folder.canonicalKey)}
          {@const isFolderExpanded = !collapsedFolderKeys.has(folder.canonicalKey)}
          <li role="none">
            <div
              bind:this={folderRows[index]}
              role="treeitem"
              aria-selected="false"
              tabindex="-1"
              aria-level="1"
              class:unavailable={(pathStatuses.get(folder.canonicalKey) ?? 'available') !== 'available'}
              title={folder.displayPath}
              aria-expanded={isFolderExpanded}
              onclick={() => toggleFolder(folder.canonicalKey)}
              onkeydown={(event) => handleKeydown(event, index)}
              oncontextmenu={(event) => openMenu(event, { kind: 'folder', index })}
            >
              <TreeChevron isExpanded={isFolderExpanded} />
              <TreeItemIcon kind={isFolderExpanded ? 'openFolder' : 'folder'} />
              <span class="name">{labelOf(folder)}</span>
            </div>
            {#if isFolderExpanded}
              <FolderContents
                folderPath={folder.displayPath}
                level={2}
                {translator}
                {folderRevisions}
                {activeDocumentKey}
                shouldRevealActiveDocument
                {onListFolder}
                {onShowFolder}
                {onOpenDocument}
              />
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</section>
{#if menuRequest?.kind === 'folder' && menuFolder}
  <ContextMenu
    label={translator.translate('explorer.folders.contextMenu.label', { name: menuFolder.fileName })}
    items={explorerFolderContextMenuItems(
      { isFavourite: favouriteKeys.has(menuFolder.canonicalKey) },
      translator,
    )}
    position={menuRequest}
    onChoose={chooseFolderItem}
    onClose={closeMenu}
  />
{:else if menuRequest?.kind === 'header'}
  <ContextMenu
    label={translator.translate('explorer.folders.headerMenu.label')}
    items={explorerFoldersHeaderMenuItems(translator)}
    position={menuRequest}
    onChoose={chooseHeaderItem}
    onClose={closeMenu}
  />
{/if}

<style>
  .header-menu {
    margin-inline-end: var(--space-1);
    padding: 0 var(--space-2);
    border: 0;
    border-radius: var(--radius-small);
    background: none;
    color: var(--color-text-secondary);
    font: inherit;
  }

  .header-menu:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .header-menu:focus-visible {
    outline: 2px solid var(--color-focus);
  }

  .open-folder {
    margin: var(--space-2);
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-small);
    background: var(--color-background);
    color: var(--color-text);
    font: inherit;
  }

  .open-folder:hover {
    background: var(--color-surface-hover);
  }

  .open-folder:focus-visible {
    outline: 2px solid var(--color-focus);
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
