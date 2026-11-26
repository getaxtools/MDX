<script lang="ts">
  import { noteTreeNodes, type NoteTreeNode } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import type { FolderListing } from '@mdx/platform';
  import { untrack } from 'svelte';
  import { activateWithKeyboard } from '../folder-tree/treeKeyboard';
  import TreeChevron from '../folder-tree/TreeChevron.svelte';
  import TreeItemIcon from '../folder-tree/TreeItemIcon.svelte';
  import NoteTreeLevel from './NoteTreeLevel.svelte';
  import { childrenFolderOf, dropPathOf, keyOfNode, type NoteTreeState } from './noteTreeState';

  interface Props {
    /** The folder listed here; for the children of a note it may not exist yet. */
    folderPath: string;
    /** What a note created here goes under: the folder, or the note these are the children of. */
    parentPath: string;
    level: number;
    tree: NoteTreeState;
    translator: Translator;
  }

  const { folderPath, parentPath, level, tree, translator }: Props = $props();

  const EMPTY_LISTING: FolderListing = { folders: [], documents: [] };
  const revision = $derived((tree.folderRevisions.get(folderPath) ?? 0) + tree.revision);
  const nodes = $derived(tree.listedNodes.get(folderPath));

  // Untracked, so a change elsewhere in the tree, such as cutting a note, does not list the folder again.
  $effect(() => {
    const path = folderPath;
    return untrack(() => tree.onShowFolder(path));
  });

  $effect(() => {
    const requestedRevision = revision;
    const path = folderPath;
    void untrack(() => tree.onListFolder(path))
      .catch(() => EMPTY_LISTING)
      .then((listing) => {
        if (requestedRevision === revision) tree.onListed(path, noteTreeNodes(listing, translator.locale));
      });
  });

  function iconOf(node: NoteTreeNode, isExpanded: boolean): 'document' | 'folder' | 'openFolder' {
    if (node.note) return 'document';
    return isExpanded ? 'openFolder' : 'folder';
  }

  function rowClicked(node: NoteTreeNode) {
    if (node.note) tree.onOpenNote(node.note.displayPath);
    else tree.onToggle(keyOfNode(node));
  }

  function rowKeydown(event: KeyboardEvent, node: NoteTreeNode) {
    if (tree.onRowKeydown(event, node, folderPath)) return;
    activateWithKeyboard(event);
  }

  function hasChildren(node: NoteTreeNode): boolean {
    return node.folder !== undefined || tree.creatingIn === node.note?.displayPath;
  }

  function finishInput(event: KeyboardEvent, finish: (value: string | undefined) => void) {
    if (!(event.currentTarget instanceof HTMLInputElement)) return;
    if (event.key === 'Enter') finish(event.currentTarget.value);
    if (event.key === 'Escape') {
      event.stopPropagation();
      finish(undefined);
    }
  }

  function focusAndSelect(input: HTMLInputElement) {
    input.focus();
    input.select();
  }

  function isFocusHeldOutsideTree(row: HTMLElement): boolean {
    const focused = globalThis.document.activeElement;
    if (focused === null || focused === globalThis.document.body) return false;
    return !row.closest('[role="tree"]')?.contains(focused);
  }

  function focusWhenWanted(row: HTMLElement, path: string) {
    if (tree.focusPath?.toLowerCase() !== path.toLowerCase()) return;
    if (!isFocusHeldOutsideTree(row)) row.focus();
    tree.onFocused();
  }
</script>

{#if tree.creatingIn === parentPath}
  <li role="none">
    <input
      aria-label={translator.translate('notes.tree.nameInput.label')}
      use:focusAndSelect
      onkeydown={(event) => finishInput(event, tree.onFinishCreate)}
      onblur={(event) => tree.onFinishCreate(event.currentTarget.value)}
    />
  </li>
{/if}
{#if nodes === undefined || (nodes.length === 0 && tree.creatingIn !== parentPath)}
  <li role="none">
    <div
      class="tree-status"
      role="treeitem"
      aria-selected="false"
      aria-level={level}
      aria-disabled="true"
      tabindex="-1"
    >
      {translator.translate(nodes === undefined ? 'notes.tree.loading' : 'notes.tree.empty')}
    </div>
  </li>
{:else}
  {#each nodes as node (keyOfNode(node))}
    {@const key = keyOfNode(node)}
    {@const isExpanded = hasChildren(node) && tree.expandedKeys.has(key)}
    {@const isActive = node.note !== undefined && node.note.canonicalKey === tree.activeDocumentKey}
    <li role="none">
      {#if node.note && tree.renamingKey === node.note.canonicalKey}
        <input
          aria-label={translator.translate('notes.tree.renameInput.label', { name: node.name })}
          value={node.name}
          use:focusAndSelect
          onkeydown={(event) => finishInput(event, (name) => tree.onFinishRename(node, name))}
          onblur={(event) => tree.onFinishRename(node, event.currentTarget.value)}
        />
      {:else}
        <div
          role="treeitem"
          tabindex="-1"
          aria-level={level}
          aria-selected={isActive}
          aria-expanded={hasChildren(node) ? isExpanded : undefined}
          class:selected={isActive}
          class:cut={node.note !== undefined && node.note.canonicalKey === tree.cutKey}
          class:drop-target={tree.dropTargetPath === dropPathOf(node)}
          data-drop-path={dropPathOf(node)}
          use:focusWhenWanted={dropPathOf(node)}
          title={(node.note ?? node.folder)?.displayPath}
          onclick={() => rowClicked(node)}
          onkeydown={(event) => rowKeydown(event, node)}
          oncontextmenu={(event) => tree.onRowContextMenu(event, node, folderPath)}
          onpointerdown={(event) => tree.onRowPointerdown(event, node)}
        >
          {#if hasChildren(node)}
            <span
              class="toggle"
              data-tree-toggle
              aria-hidden="true"
              onclick={(event) => {
                event.stopPropagation();
                tree.onToggle(key);
              }}
            >
              <TreeChevron {isExpanded} />
            </span>
          {:else}
            <span class="chevron-space" aria-hidden="true"></span>
          {/if}
          <TreeItemIcon kind={iconOf(node, isExpanded)} />
          <span class="name">{node.name}</span>
        </div>
      {/if}
      {#if isExpanded}
        <ul class="folder-contents" role="group">
          <NoteTreeLevel
            folderPath={childrenFolderOf(node)}
            parentPath={node.note?.displayPath ?? childrenFolderOf(node)}
            level={level + 1}
            {tree}
            {translator}
          />
        </ul>
      {/if}
    </li>
  {/each}
{/if}

<style>
  .folder-contents {
    margin-inline-start: calc(var(--space-2) + 8px) !important;
    padding-inline-start: var(--space-1) !important;
    border-inline-start: 1px solid var(--color-border);
  }

  .toggle {
    display: inline-flex;
    flex: none;
  }

  .chevron-space {
    flex: none;
    width: 16px;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cut .name {
    font-style: italic;
    text-decoration: underline dashed;
  }

  .drop-target {
    outline: 2px dashed var(--color-focus);
    outline-offset: -2px;
  }

  .tree-status {
    color: var(--color-text-secondary) !important;
    font-size: var(--text-size-small) !important;
  }
</style>
