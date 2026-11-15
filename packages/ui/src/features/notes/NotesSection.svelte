<script lang="ts">
  import { noteNameOf, type NoteTreeNode } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import type { DocumentLocation, FolderListing } from '@mdx/platform';
  import { SvelteSet } from 'svelte/reactivity';
  import ConfirmDialog from '../../components/ConfirmDialog.svelte';
  import ContextMenu from '../../components/ContextMenu.svelte';
  import { contextMenuPosition, isContextMenuKey } from '../../components/ContextMenuItem';
  import { treeKeyboard } from '../folder-tree/treeKeyboard';
  import {
    commandForPathMenuItem,
    isPathMenuItem,
    type PathCommand,
    type PathMenuItemId,
  } from '../file-paths/pathCommands';
  import ExplorerSectionHeader from '../explorer/ExplorerSectionHeader.svelte';
  import type { NotesCommand } from './NotesActions';
  import NoteTreeLevel from './NoteTreeLevel.svelte';
  import { noteTreeMenuItems, type NoteTreeMenuItemId } from './noteTreeContextMenu';
  import { dropPathOf, keyOfNode, type NoteTreeState } from './noteTreeState';

  interface Props {
    locationPath: string;
    revision: number;
    /** Delete asks first; the note goes to the Notes trash either way. */
    isDeletionConfirmed: boolean;
    translator: Translator;
    isExpanded: boolean;
    onToggleExpanded: () => void;
    folderRevisions: ReadonlyMap<string, number>;
    activeDocumentKey?: string | undefined;
    onListFolder: (folderPath: string) => Promise<FolderListing>;
    onShowFolder: (folderPath: string) => () => void;
    onOpenDocument: (documentPath: string) => void;
    onCommand: (command: NotesCommand | PathCommand) => Promise<void> | void;
  }

  const {
    locationPath,
    revision,
    isDeletionConfirmed,
    translator,
    isExpanded,
    onToggleExpanded,
    folderRevisions,
    activeDocumentKey,
    onListFolder,
    onShowFolder,
    onOpenDocument,
    onCommand,
  }: Props = $props();

  const DRAG_START_DISTANCE_PX = 5;

  interface MenuRequest {
    readonly node: NoteTreeNode;
    readonly folderPath: string;
    readonly x: number;
    readonly y: number;
  }

  const expandedKeys = new SvelteSet<string>();
  let renamingKey: string | undefined = $state();
  let creatingIn: string | undefined = $state();
  let cutNote: DocumentLocation | undefined = $state();
  let dropTargetPath: string | undefined = $state();
  let focusPath: string | undefined = $state();
  let menuRequest: MenuRequest | undefined = $state();
  let deletingNode: NoteTreeNode | undefined = $state();
  let menuReturnFocus: HTMLElement | undefined;

  const tree: NoteTreeState = $derived({
    revision,
    folderRevisions,
    expandedKeys,
    activeDocumentKey,
    renamingKey,
    creatingIn,
    cutKey: cutNote?.canonicalKey,
    dropTargetPath,
    focusPath,
    onFocused: () => (focusPath = undefined),
    onListFolder,
    onShowFolder,
    onOpenNote: onOpenDocument,
    onToggle: toggle,
    onRowKeydown: handleRowKeydown,
    onRowContextMenu: openMenu,
    onRowPointerdown: startDrag,
    onFinishRename: finishRename,
    onFinishCreate: finishCreate,
  });

  function toggle(key: string) {
    if (expandedKeys.has(key)) expandedKeys.delete(key);
    else expandedKeys.add(key);
  }

  function startCreating(parent: string, expandKey?: string) {
    if (!isExpanded) onToggleExpanded();
    if (expandKey !== undefined) expandedKeys.add(expandKey);
    creatingIn = parent;
  }

  function finishCreate(name: string | undefined) {
    const parent = creatingIn;
    creatingIn = undefined;
    if (parent === undefined || !name?.trim()) return;
    void onCommand({ kind: 'createNote', parent, name: name.trim() });
  }

  async function finishRename(node: NoteTreeNode, name: string | undefined) {
    if (renamingKey === undefined || !node.note) return;
    renamingKey = undefined;
    const newName = name?.trim() ?? '';
    const { note } = node;
    if (newName === '' || newName === node.name) {
      focusPath = note.displayPath;
      return;
    }
    await onCommand({ kind: 'renameNote', note, name: newName });
    focusPath = `${note.displayPath.slice(0, -note.fileName.length)}${newName}${extensionOf(note.fileName)}`;
  }

  /** Moves the cut note into a folder, or under a note as its child. */
  async function paste(into: string, { isUnderNote }: { isUnderNote: boolean }) {
    const note = cutNote;
    if (!note) return;
    cutNote = undefined;
    await onCommand({ kind: 'moveNote', note, into });
    focusPath = `${isUnderNote ? childrenFolderOfPath(into) : into}\\${note.fileName}`;
  }

  function handleRowKeydown(event: KeyboardEvent, node: NoteTreeNode, folderPath: string): boolean {
    if (isContextMenuKey(event)) {
      openMenu(event, node, folderPath);
      return true;
    }
    const action = keyActionFor(event, node, folderPath);
    if (!action) return false;
    event.preventDefault();
    action();
    return true;
  }

  function keyActionFor(event: KeyboardEvent, node: NoteTreeNode, folderPath: string) {
    const { note } = node;
    if (event.key === 'Escape') return cutNote ? () => (cutNote = undefined) : undefined;
    if (event.key === 'F2') return note ? () => (renamingKey = note.canonicalKey) : undefined;
    if (event.key === 'Delete') return note ? () => requestDeletion(node) : undefined;
    return event.ctrlKey ? clipboardActionFor(event.key.toLowerCase(), node, folderPath) : undefined;
  }

  /** Ctrl+X cuts a note, Ctrl+V moves it into the folder, or next to the note, that has focus. */
  function clipboardActionFor(key: string, node: NoteTreeNode, folderPath: string) {
    const { note } = node;
    if (key === 'x' && note) return () => (cutNote = note);
    if (key !== 'v' || !cutNote) return undefined;
    return () => void paste(note ? folderPath : dropPathOf(node), { isUnderNote: false });
  }

  function openMenu(event: MouseEvent | KeyboardEvent, node: NoteTreeNode, folderPath: string) {
    event.preventDefault();
    menuReturnFocus = event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined;
    menuRequest = { node, folderPath, ...contextMenuPosition(event) };
  }

  function chooseMenuItem(itemId: NoteTreeMenuItemId) {
    if (!menuRequest) return;
    const { node, folderPath } = menuRequest;
    const path = dropPathOf(node);
    if (isPathMenuItem(itemId)) {
      void onCommand(commandForPathMenuItem(itemId, path));
      return;
    }
    const { note } = node;
    const actions: Record<Exclude<NoteTreeMenuItemId, PathMenuItemId>, () => void> = {
      newNote: () => startCreating(path, keyOfNode(node)),
      rename: () => (renamingKey = note?.canonicalKey),
      cut: () => (cutNote = note),
      pasteAsChild: () => void paste(path, { isUnderNote: true }),
      pasteHere: () => void paste(note ? folderPath : path, { isUnderNote: false }),
      delete: () => requestDeletion(node),
    };
    actions[itemId]();
  }

  function requestDeletion(node: NoteTreeNode) {
    if (isDeletionConfirmed) deletingNode = node;
    else deleteNote(node);
  }

  function deleteNote(node: NoteTreeNode) {
    deletingNode = undefined;
    if (node.note) void onCommand({ kind: 'deleteNote', note: node.note });
  }

  function closeMenu() {
    menuRequest = undefined;
    if (renamingKey === undefined && creatingIn === undefined) menuReturnFocus?.focus();
  }

  function startDrag(event: PointerEvent, node: NoteTreeNode) {
    const { note } = node;
    if (!note || event.button !== 0) return;
    const start = { x: event.clientX, y: event.clientY };
    let isDragging = false;
    const move = (moveEvent: PointerEvent) => {
      isDragging ||=
        Math.hypot(moveEvent.clientX - start.x, moveEvent.clientY - start.y) > DRAG_START_DISTANCE_PX;
      if (isDragging) dropTargetPath = dropPathAt(moveEvent);
    };
    const finish = () => {
      globalThis.removeEventListener('pointermove', move);
      globalThis.removeEventListener('pointerup', finish);
      const target = dropTargetPath;
      dropTargetPath = undefined;
      if (isDragging && target !== undefined && target !== note.displayPath) {
        void onCommand({ kind: 'moveNote', note, into: target });
      }
    };
    globalThis.addEventListener('pointermove', move);
    globalThis.addEventListener('pointerup', finish);
  }

  function dropPathAt(event: PointerEvent): string | undefined {
    const element = globalThis.document.elementFromPoint(event.clientX, event.clientY);
    return element?.closest<HTMLElement>('[data-drop-path]')?.dataset.dropPath;
  }

  function extensionOf(fileName: string): string {
    return fileName.slice(noteNameOf(fileName).length);
  }

  function childrenFolderOfPath(notePath: string): string {
    const fileName = notePath.split('\\').at(-1) ?? notePath;
    return notePath.slice(0, notePath.length - extensionOf(fileName).length);
  }
</script>

<section aria-labelledby="notes-tree-heading">
  <ExplorerSectionHeader
    section="folders"
    headingId="notes-tree-heading"
    title={translator.translate('notes.tree.title')}
    {isExpanded}
    onToggle={onToggleExpanded}
  >
    {#snippet actions()}
      <button
        class="header-action"
        aria-label={translator.translate('notes.tree.newNote')}
        title={translator.translate('notes.tree.newNote')}
        onclick={() => startCreating(locationPath)}
      >
        <span aria-hidden="true">+</span>
      </button>
      <button
        class="header-action"
        aria-label={translator.translate('notes.tree.showTrash')}
        title={translator.translate('notes.tree.showTrash')}
        onclick={() => void onCommand({ kind: 'showNoteTrash' })}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />
        </svg>
      </button>
    {/snippet}
  </ExplorerSectionHeader>
  {#if isExpanded}
    <ul
      role="tree"
      aria-labelledby="notes-tree-heading"
      data-drop-path={locationPath}
      class:drop-target={dropTargetPath === locationPath}
      use:treeKeyboard
    >
      <NoteTreeLevel folderPath={locationPath} parentPath={locationPath} level={1} {tree} {translator} />
    </ul>
    <p class="visually-hidden" aria-live="polite">
      {cutNote ? translator.translate('notes.tree.cutStatus', { name: noteNameOf(cutNote.fileName) }) : ''}
    </p>
  {/if}
</section>
{#if menuRequest}
  <ContextMenu
    label={translator.translate('notes.tree.contextMenu.label', { name: menuRequest.node.name })}
    items={noteTreeMenuItems(menuRequest.node, { hasCutNote: cutNote !== undefined }, translator)}
    position={menuRequest}
    onChoose={chooseMenuItem}
    onClose={closeMenu}
  />
{/if}
{#if deletingNode}
  {@const node = deletingNode}
  <ConfirmDialog
    title={translator.translate('notes.trash.confirmTitle', { name: node.name })}
    message={translator.translate(
      node.folder ? 'notes.trash.confirmWithChildren' : 'notes.trash.confirmMessage',
    )}
    confirmLabel={translator.translate('notes.trash.confirm')}
    cancelLabel={translator.translate('notes.trash.cancel')}
    onConfirm={() => deleteNote(node)}
    onCancel={() => {
      deletingNode = undefined;
      menuReturnFocus?.focus();
    }}
  />
{/if}

<style>
  .header-action {
    margin-inline-end: var(--space-1);
    padding: 0 var(--space-2);
    border: 0;
    border-radius: var(--radius-small);
    background: none;
    color: var(--color-text-secondary);
    font: inherit;
    font-size: 1.1em;
  }

  .header-action svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.3;
    stroke-linecap: round;
    stroke-linejoin: round;
    vertical-align: -2px;
  }

  .header-action:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .header-action:focus-visible {
    outline: 2px solid var(--color-focus);
  }

  .drop-target {
    outline: 2px dashed var(--color-focus);
    outline-offset: -2px;
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
