<script lang="ts">
  import { displayNameOf, type Favourite } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import type { DocumentLocation, PathStatus } from '@mdx/platform';
  import { tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import ContextMenu from '../../components/ContextMenu.svelte';
  import { contextMenuPosition, isContextMenuKey } from '../../components/ContextMenuItem';
  import { favouriteContextMenuItems, type FavouriteMenuItemId } from './favouriteContextMenu';
  import type { FavouriteCommand } from './favouriteCommands';
  import FolderContents from './FolderContents.svelte';

  interface Props {
    favourites: readonly Favourite[];
    pathStatuses: ReadonlyMap<string, PathStatus>;
    translator: Translator;
    onOpen: (favourite: Favourite) => void;
    onCommand: (command: FavouriteCommand) => void;
    onListFolder: (folderPath: string) => Promise<readonly DocumentLocation[]>;
    onOpenDocument: (documentPath: string) => void;
  }

  const { favourites, pathStatuses, translator, onOpen, onCommand, onListFolder, onOpenDocument }: Props =
    $props();

  const expandedFolderKeys = new SvelteSet<string>();

  function activate(favourite: Favourite) {
    if (favourite.kind === 'file') {
      onOpen(favourite);
      return;
    }
    const key = favourite.location.canonicalKey;
    if (expandedFolderKeys.has(key)) expandedFolderKeys.delete(key);
    else expandedFolderKeys.add(key);
  }

  let itemButtons: HTMLButtonElement[] = $state([]);
  let menuRequest: { readonly index: number; readonly x: number; readonly y: number } | undefined = $state();
  let renamingIndex: number | undefined = $state();

  const menuFavourite = $derived(menuRequest ? favourites[menuRequest.index] : undefined);

  function labelOf(favourite: Favourite): string {
    const name = displayNameOf(favourite);
    const status = pathStatuses.get(favourite.location.canonicalKey) ?? 'available';
    return status === 'available' ? name : translator.translate(`favourites.status.${status}`, { name });
  }

  function move(index: number, toIndex: number) {
    const favourite = favourites[index];
    if (!favourite || toIndex < 0 || toIndex >= favourites.length) return;
    onCommand({ kind: 'moveFavourite', canonicalKey: favourite.location.canonicalKey, toIndex });
    void tick().then(() => itemButtons[toIndex]?.focus());
  }

  const KEY_ACTIONS: Readonly<Record<string, (index: number) => void>> = {
    F2: (index) => (renamingIndex = index),
    Delete: (index) => remove(index),
  };

  function handleKeydown(event: KeyboardEvent, index: number) {
    if (isContextMenuKey(event)) {
      openMenu(event, index);
      return;
    }
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      move(index, event.key === 'ArrowUp' ? index - 1 : index + 1);
      return;
    }
    const action = KEY_ACTIONS[event.key];
    if (!action) return;
    event.preventDefault();
    action(index);
  }

  function remove(index: number) {
    const favourite = favourites[index];
    if (favourite) onCommand({ kind: 'removeFavourite', canonicalKey: favourite.location.canonicalKey });
  }

  function openMenu(event: MouseEvent | KeyboardEvent, index: number) {
    event.preventDefault();
    menuRequest = { index, ...contextMenuPosition(event) };
  }

  function chooseMenuItem(itemId: FavouriteMenuItemId) {
    const index = menuRequest?.index;
    if (index === undefined || !menuFavourite) return;
    const actions: Record<FavouriteMenuItemId, () => void> = {
      open: () => activate(menuFavourite),
      rename: () => (renamingIndex = index),
      moveUp: () => move(index, index - 1),
      moveDown: () => move(index, index + 1),
      remove: () => remove(index),
    };
    actions[itemId]();
  }

  function closeMenu() {
    const index = menuRequest?.index;
    menuRequest = undefined;
    if (index !== undefined && renamingIndex === undefined) itemButtons[index]?.focus();
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
    void tick().then(() => itemButtons[index]?.focus());
  }

  function handleRenameKeydown(event: KeyboardEvent, favourite: Favourite) {
    if (!(event.currentTarget instanceof HTMLInputElement)) return;
    if (event.key === 'Enter') finishRename(event.currentTarget, favourite, true);
    if (event.key === 'Escape') {
      event.stopPropagation();
      finishRename(event.currentTarget, favourite, false);
    }
  }

  function focusAndSelect(input: HTMLInputElement) {
    input.focus();
    input.select();
  }
</script>

<section aria-labelledby="favourites-heading">
  <h2 id="favourites-heading">{translator.translate('favourites.sidebar.title')}</h2>
  {#if favourites.length === 0}
    <p class="empty-state">{translator.translate('favourites.sidebar.emptyState')}</p>
  {:else}
    <ul>
      {#each favourites as favourite, index (favourite.location.canonicalKey)}
        <li>
          {#if renamingIndex === index}
            <input
              aria-label={translator.translate('favourites.renameInput.label', {
                name: displayNameOf(favourite),
              })}
              value={displayNameOf(favourite)}
              use:focusAndSelect
              onkeydown={(event) => handleRenameKeydown(event, favourite)}
              onblur={(event) => finishRename(event.currentTarget, favourite, true)}
            />
          {:else}
            <button
              bind:this={itemButtons[index]}
              class:unavailable={(pathStatuses.get(favourite.location.canonicalKey) ?? 'available') !==
                'available'}
              title={favourite.location.displayPath}
              aria-expanded={favourite.kind === 'folder'
                ? expandedFolderKeys.has(favourite.location.canonicalKey)
                : undefined}
              onclick={() => activate(favourite)}
              onkeydown={(event) => handleKeydown(event, index)}
              oncontextmenu={(event) => openMenu(event, index)}
            >
              <span aria-hidden="true">{favourite.kind === 'folder' ? '📁' : '★'}</span>
              {labelOf(favourite)}
            </button>
            {#if expandedFolderKeys.has(favourite.location.canonicalKey)}
              <FolderContents
                folderPath={favourite.location.displayPath}
                {translator}
                {onListFolder}
                {onOpenDocument}
              />
            {/if}
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>
{#if menuRequest && menuFavourite}
  <ContextMenu
    label={translator.translate('favourites.contextMenu.label', { name: displayNameOf(menuFavourite) })}
    items={favouriteContextMenuItems({ index: menuRequest.index, count: favourites.length }, translator)}
    position={menuRequest}
    onChoose={chooseMenuItem}
    onClose={closeMenu}
  />
{/if}
