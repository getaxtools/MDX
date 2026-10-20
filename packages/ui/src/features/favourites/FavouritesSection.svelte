<script lang="ts">
  import { displayNameOf, nextFavouriteGroupId, type Favourite, type FavouriteGroup } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import type { FolderListing, PathStatus } from '@mdx/platform';
  import { tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import ContextMenu from '../../components/ContextMenu.svelte';
  import { contextMenuPosition, isContextMenuKey } from '../../components/ContextMenuItem';
  import {
    favouriteContextMenuItems,
    favouriteGroupContextMenuItems,
    favouritesHeaderMenuItems,
    groupIdOfMenuItem,
    type FavouriteGroupMenuItemId,
    type FavouriteMenuItemId,
    type FavouritesHeaderMenuItemId,
  } from './favouriteContextMenu';
  import type { FavouriteCommand, FavouritesFileCommand } from './favouriteCommands';
  import FolderContents from '../folder-tree/FolderContents.svelte';
  import TreeChevron from '../folder-tree/TreeChevron.svelte';
  import { activateWithKeyboard, treeKeyboard } from '../folder-tree/treeKeyboard';
  import TreeItemIcon from '../folder-tree/TreeItemIcon.svelte';
  import type { FolderTreeCommand } from '../folder-tree/folderTreeCommands';
  import type { ExplorerActionCommand } from '../explorer/explorerCommands';
  import ExplorerSectionHeader from '../explorer/ExplorerSectionHeader.svelte';

  interface Props {
    favourites: readonly Favourite[];
    groups?: readonly FavouriteGroup[];
    pathStatuses: ReadonlyMap<string, PathStatus>;
    translator: Translator;
    onOpen: (favourite: Favourite) => void;
    onCommand: (
      command: FavouriteCommand | FavouritesFileCommand | FolderTreeCommand | ExplorerActionCommand,
    ) => void;
    onListFolder: (folderPath: string) => Promise<FolderListing>;
    onOpenDocument: (documentPath: string) => void;
    folderRevisions?: ReadonlyMap<string, number>;
    onShowFolder?: (folderPath: string) => () => void;
    isExpanded?: boolean;
    onToggleExpanded?: () => void;
    activeDocumentKey?: string | undefined;
  }

  const {
    favourites,
    groups = [],
    pathStatuses,
    translator,
    onOpen,
    onCommand,
    onListFolder,
    onOpenDocument,
    folderRevisions = new Map(),
    onShowFolder = () => () => undefined,
    isExpanded = true,
    onToggleExpanded = () => undefined,
    activeDocumentKey,
  }: Props = $props();

  type MenuRequest =
    | { readonly kind: 'favourite'; readonly index: number; readonly x: number; readonly y: number }
    | { readonly kind: 'group'; readonly group: FavouriteGroup; readonly x: number; readonly y: number }
    | { readonly kind: 'header'; readonly x: number; readonly y: number };

  const expandedFolderKeys = new SvelteSet<string>();
  const collapsedGroupIds = new SvelteSet<string>();
  let itemRows: HTMLElement[] = $state([]);
  let menuRequest: MenuRequest | undefined = $state();
  let renamingIndex: number | undefined = $state();
  let renamingGroupId: string | undefined = $state();

  const ungroupedFavourites = $derived(favourites.filter((favourite) => favourite.groupId === undefined));
  const groupedFavourites = $derived(
    groups.map((group) => ({
      group,
      items: favourites.filter((favourite) => favourite.groupId === group.id),
    })),
  );
  /** Favourites in the order they appear, which is what item indexes refer to. */
  const shownFavourites = $derived([
    ...ungroupedFavourites,
    ...groupedFavourites.flatMap(({ items }) => items),
  ]);
  const menuFavourite = $derived(
    menuRequest?.kind === 'favourite' ? shownFavourites[menuRequest.index] : undefined,
  );

  function activate(favourite: Favourite) {
    if (favourite.kind === 'file') {
      onOpen(favourite);
      return;
    }
    toggle(expandedFolderKeys, favourite.location.canonicalKey);
  }

  function toggle(set: SvelteSet<string>, key: string) {
    if (set.has(key)) set.delete(key);
    else set.add(key);
  }

  function labelOf(favourite: Favourite): string {
    const name = displayNameOf(favourite);
    const status = pathStatuses.get(favourite.location.canonicalKey) ?? 'available';
    return status === 'available' ? name : translator.translate(`favourites.status.${status}`, { name });
  }

  /** A neighbour in the same group, which is the only place a favourite can move to with Up or Down. */
  function neighbourOf(index: number, step: -1 | 1): Favourite | undefined {
    const neighbour = shownFavourites[index + step];
    return neighbour && neighbour.groupId === shownFavourites[index]?.groupId ? neighbour : undefined;
  }

  function move(index: number, step: -1 | 1) {
    const favourite = shownFavourites[index];
    const neighbour = neighbourOf(index, step);
    if (!favourite || !neighbour) return;
    onCommand({
      kind: 'moveFavourite',
      canonicalKey: favourite.location.canonicalKey,
      toIndex: favourites.indexOf(neighbour),
    });
    void tick().then(() => itemRows[index + step]?.focus());
  }

  const KEY_ACTIONS: Readonly<Record<string, (index: number) => void>> = {
    F2: (index) => (renamingIndex = index),
    Delete: (index) => remove(index),
  };

  function handleKeydown(event: KeyboardEvent, index: number) {
    activateWithKeyboard(event);
    if (isContextMenuKey(event)) {
      openMenu(event, { kind: 'favourite', index });
      return;
    }
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      move(index, event.key === 'ArrowUp' ? -1 : 1);
      return;
    }
    const action = KEY_ACTIONS[event.key];
    if (!action) return;
    event.preventDefault();
    action(index);
  }

  function handleGroupKeydown(event: KeyboardEvent, group: FavouriteGroup) {
    activateWithKeyboard(event);
    if (isContextMenuKey(event)) {
      openMenu(event, { kind: 'group', group });
      return;
    }
    if (event.key === 'F2') renamingGroupId = group.id;
    else if (event.key === 'Delete') onCommand({ kind: 'removeFavouriteGroup', groupId: group.id });
    else return;
    event.preventDefault();
  }

  function remove(index: number) {
    const favourite = shownFavourites[index];
    if (favourite) onCommand({ kind: 'removeFavourite', canonicalKey: favourite.location.canonicalKey });
  }

  function openMenu(
    event: MouseEvent | KeyboardEvent,
    target:
      { kind: 'favourite'; index: number } | { kind: 'group'; group: FavouriteGroup } | { kind: 'header' },
  ) {
    event.preventDefault();
    menuRequest = { ...target, ...contextMenuPosition(event) };
  }

  function createGroup(canonicalKey?: string) {
    const groupId = nextFavouriteGroupId(groups);
    const name = translator.translate('favourites.group.defaultName', { number: groups.length + 1 });
    onCommand({ kind: 'createFavouriteGroup', groupId, name, ...(canonicalKey ? { canonicalKey } : {}) });
    renamingGroupId = groupId;
  }

  function chooseFavouriteItem(itemId: FavouriteMenuItemId) {
    if (menuRequest?.kind !== 'favourite' || !menuFavourite) return;
    const { index } = menuRequest;
    const canonicalKey = menuFavourite.location.canonicalKey;
    const targetGroupId = groupIdOfMenuItem(itemId);
    if (targetGroupId !== undefined) {
      onCommand({ kind: 'moveFavouriteToGroup', canonicalKey, groupId: targetGroupId });
      return;
    }
    const favourite = menuFavourite;
    const actions: Partial<Record<FavouriteMenuItemId, () => void>> = {
      open: () => activate(favourite),
      rename: () => (renamingIndex = index),
      moveUp: () => move(index, -1),
      moveDown: () => move(index, 1),
      moveToNewGroup: () => createGroup(canonicalKey),
      removeFromGroup: () => onCommand({ kind: 'moveFavouriteToGroup', canonicalKey }),
      refresh: () => onCommand({ kind: 'refreshFolders' }),
      remove: () => remove(index),
    };
    actions[itemId]?.();
  }

  function chooseGroupItem(itemId: FavouriteGroupMenuItemId) {
    if (menuRequest?.kind !== 'group') return;
    const { group } = menuRequest;
    if (itemId === 'renameGroup') renamingGroupId = group.id;
    else onCommand({ kind: 'removeFavouriteGroup', groupId: group.id });
  }

  function chooseHeaderItem(itemId: FavouritesHeaderMenuItemId) {
    if (itemId === 'newGroup') createGroup();
    else onCommand({ kind: itemId });
  }

  function closeMenu() {
    const request = menuRequest;
    menuRequest = undefined;
    if (request?.kind === 'favourite' && renamingIndex === undefined) itemRows[request.index]?.focus();
  }

  function finishRename(input: HTMLInputElement, favourite: Favourite, shouldSave: boolean) {
    if (renamingIndex === undefined) return;
    const index = renamingIndex;
    renamingIndex = undefined;
    if (shouldSave) {
      onCommand({
        kind: 'renameFavourite',
        canonicalKey: favourite.location.canonicalKey,
        label: input.value,
      });
    }
    void tick().then(() => itemRows[index]?.focus());
  }

  function finishGroupRename(input: HTMLInputElement, group: FavouriteGroup, shouldSave: boolean) {
    if (renamingGroupId === undefined) return;
    renamingGroupId = undefined;
    if (shouldSave) onCommand({ kind: 'renameFavouriteGroup', groupId: group.id, name: input.value });
  }

  function handleRenameKeydown(
    event: KeyboardEvent,
    finish: (input: HTMLInputElement, save: boolean) => void,
  ) {
    if (!(event.currentTarget instanceof HTMLInputElement)) return;
    if (event.key === 'Enter') finish(event.currentTarget, true);
    if (event.key === 'Escape') {
      event.stopPropagation();
      finish(event.currentTarget, false);
    }
  }

  function focusAndSelect(input: HTMLInputElement) {
    input.focus();
    input.select();
  }
</script>

{#snippet favouriteItem(favourite: Favourite, level: number)}
  {@const index = shownFavourites.indexOf(favourite)}
  <li role="none">
    {#if renamingIndex === index}
      <input
        aria-label={translator.translate('favourites.renameInput.label', { name: displayNameOf(favourite) })}
        value={displayNameOf(favourite)}
        use:focusAndSelect
        onkeydown={(event) =>
          handleRenameKeydown(event, (input, save) => finishRename(input, favourite, save))}
        onblur={(event) => finishRename(event.currentTarget, favourite, true)}
      />
    {:else}
      <div
        bind:this={itemRows[index]}
        role="treeitem"
        aria-selected="false"
        tabindex="-1"
        aria-level={level}
        class:unavailable={(pathStatuses.get(favourite.location.canonicalKey) ?? 'available') !== 'available'}
        title={favourite.location.displayPath}
        aria-expanded={favourite.kind === 'folder'
          ? expandedFolderKeys.has(favourite.location.canonicalKey)
          : undefined}
        onclick={() => activate(favourite)}
        onkeydown={(event) => handleKeydown(event, index)}
        oncontextmenu={(event) => openMenu(event, { kind: 'favourite', index })}
      >
        {#if favourite.kind === 'folder'}
          {@const isExpanded = expandedFolderKeys.has(favourite.location.canonicalKey)}
          <TreeChevron {isExpanded} />
          <TreeItemIcon kind={isExpanded ? 'openFolder' : 'folder'} />
        {:else}
          <span class="chevron-space" aria-hidden="true"></span>
          <TreeItemIcon kind="document" />
        {/if}
        <span class="name">{labelOf(favourite)}</span>
      </div>
      {#if expandedFolderKeys.has(favourite.location.canonicalKey)}
        <FolderContents
          folderPath={favourite.location.displayPath}
          level={level + 1}
          {activeDocumentKey}
          {translator}
          {folderRevisions}
          {onListFolder}
          {onShowFolder}
          {onOpenDocument}
        />
      {/if}
    {/if}
  </li>
{/snippet}

<section aria-labelledby="favourites-heading">
  <ExplorerSectionHeader
    headingId="favourites-heading"
    title={translator.translate('favourites.sidebar.title')}
    {isExpanded}
    onToggle={onToggleExpanded}
  >
    {#snippet actions()}
      <button
        class="header-menu"
        aria-label={translator.translate('favourites.headerMenu.label')}
        title={translator.translate('favourites.headerMenu.label')}
        aria-haspopup="menu"
        onclick={(event) => openMenu(event, { kind: 'header' })}
      >
        <span aria-hidden="true">⋯</span>
      </button>
    {/snippet}
  </ExplorerSectionHeader>
  {#if isExpanded}
    {#if favourites.length === 0 && groups.length === 0}
      <p class="empty-state">{translator.translate('favourites.sidebar.emptyState')}</p>
    {:else}
      <ul role="tree" aria-labelledby="favourites-heading" use:treeKeyboard>
        {#each ungroupedFavourites as favourite (favourite.location.canonicalKey)}
          <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- rendering a snippet is not a value -->
          {@render favouriteItem(favourite, 1)}
        {/each}
        {#each groupedFavourites as { group, items } (group.id)}
          {@const isExpanded = !collapsedGroupIds.has(group.id)}
          <li class="group" role="none">
            {#if renamingGroupId === group.id}
              <input
                aria-label={translator.translate('favourites.group.renameInput.label', { name: group.name })}
                value={group.name}
                use:focusAndSelect
                onkeydown={(event) =>
                  handleRenameKeydown(event, (input, save) => finishGroupRename(input, group, save))}
                onblur={(event) => finishGroupRename(event.currentTarget, group, true)}
              />
            {:else}
              <div
                class="group-header"
                role="treeitem"
                aria-selected="false"
                tabindex="-1"
                aria-level="1"
                aria-expanded={isExpanded}
                onclick={() => toggle(collapsedGroupIds, group.id)}
                onkeydown={(event) => handleGroupKeydown(event, group)}
                oncontextmenu={(event) => openMenu(event, { kind: 'group', group })}
              >
                <TreeChevron {isExpanded} />
                <span class="name">{group.name}</span>
              </div>
            {/if}
            {#if isExpanded}
              <ul class="group-items" role="group">
                {#if items.length === 0}
                  <li role="none">
                    <div
                      class="group-empty"
                      role="treeitem"
                      aria-selected="false"
                      aria-level="2"
                      aria-disabled="true"
                      tabindex="-1"
                    >
                      {translator.translate('favourites.group.emptyState')}
                    </div>
                  </li>
                {:else}
                  {#each items as favourite (favourite.location.canonicalKey)}
                    <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- rendering a snippet is not a value -->
                    {@render favouriteItem(favourite, 2)}
                  {/each}
                {/if}
              </ul>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</section>
{#if menuRequest?.kind === 'favourite' && menuFavourite}
  {@const index = menuRequest.index}
  <ContextMenu
    label={translator.translate('favourites.contextMenu.label', { name: displayNameOf(menuFavourite) })}
    items={favouriteContextMenuItems(
      {
        canMoveUp: neighbourOf(index, -1) !== undefined,
        canMoveDown: neighbourOf(index, 1) !== undefined,
        groups,
        groupId: menuFavourite.groupId,
        isFolder: menuFavourite.kind === 'folder',
      },
      translator,
    )}
    position={menuRequest}
    onChoose={chooseFavouriteItem}
    onClose={closeMenu}
  />
{:else if menuRequest?.kind === 'group'}
  <ContextMenu
    label={translator.translate('favourites.group.contextMenu.label', { name: menuRequest.group.name })}
    items={favouriteGroupContextMenuItems(translator)}
    position={menuRequest}
    onChoose={chooseGroupItem}
    onClose={closeMenu}
  />
{:else if menuRequest?.kind === 'header'}
  <ContextMenu
    label={translator.translate('favourites.headerMenu.label')}
    items={favouritesHeaderMenuItems(translator)}
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

  .group-header {
    font-weight: 600;
  }

  .chevron-space {
    flex: none;
    width: 16px;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .group-items {
    padding-inline-start: var(--space-3) !important;
  }

  .group-empty {
    color: var(--color-text-secondary) !important;
    font-size: var(--text-size-small) !important;
    white-space: normal !important;
  }
</style>
