<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import type { FolderListing } from '@mdx/platform';
  import { SvelteSet } from 'svelte/reactivity';
  import FolderContents from './FolderContents.svelte';
  import { isInsideFolder } from './isInsideFolder';
  import { scrollIntoViewWhen } from './scrollIntoViewWhen';
  import { activateWithKeyboard } from './treeKeyboard';
  import TreeChevron from './TreeChevron.svelte';
  import TreeItemIcon from './TreeItemIcon.svelte';

  interface Props {
    folderPath: string;
    level: number;
    translator: Translator;
    folderRevisions: ReadonlyMap<string, number>;
    activeDocumentKey?: string | undefined;
    shouldRevealActiveDocument?: boolean;
    onListFolder: (folderPath: string) => Promise<FolderListing>;
    onShowFolder: (folderPath: string) => () => void;
    onOpenDocument: (documentPath: string) => void;
  }

  const {
    folderPath,
    level,
    translator,
    folderRevisions,
    activeDocumentKey,
    shouldRevealActiveDocument = false,
    onListFolder,
    onShowFolder,
    onOpenDocument,
  }: Props = $props();

  const revision = $derived(folderRevisions.get(folderPath) ?? 0);
  const expandedSubfolderKeys = new SvelteSet<string>();
  let listing: FolderListing | undefined = $state();
  let revealedDocumentKey: string | undefined;

  $effect(() => onShowFolder(folderPath));

  $effect(() => {
    const requestedRevision = revision;
    void onListFolder(folderPath).then((nextListing) => {
      if (requestedRevision === revision) listing = nextListing;
    });
  });

  $effect(() => {
    if (!shouldRevealActiveDocument || !listing || activeDocumentKey === revealedDocumentKey) return;
    revealedDocumentKey = activeDocumentKey;
    const key = activeDocumentKey;
    const ancestor = key
      ? listing.folders.find((folder) => isInsideFolder(key, folder.canonicalKey))
      : undefined;
    if (ancestor) expandedSubfolderKeys.add(ancestor.canonicalKey);
  });

  function toggleSubfolder(key: string) {
    if (expandedSubfolderKeys.has(key)) expandedSubfolderKeys.delete(key);
    else expandedSubfolderKeys.add(key);
  }
</script>

<ul class="folder-contents" role="group">
  {#if listing === undefined || (listing.folders.length === 0 && listing.documents.length === 0)}
    <li role="none">
      <div
        class="folder-status"
        role="treeitem"
        aria-selected="false"
        aria-level={level}
        aria-disabled="true"
        tabindex="-1"
      >
        {translator.translate(
          listing === undefined ? 'favourites.folder.loading' : 'favourites.folder.empty',
        )}
      </div>
    </li>
  {:else}
    {#each listing.folders as folder (folder.canonicalKey)}
      {@const isExpanded = expandedSubfolderKeys.has(folder.canonicalKey)}
      <li role="none">
        <div
          role="treeitem"
          aria-selected="false"
          tabindex="-1"
          aria-level={level}
          aria-expanded={isExpanded}
          title={folder.displayPath}
          onclick={() => toggleSubfolder(folder.canonicalKey)}
          onkeydown={activateWithKeyboard}
        >
          <TreeChevron {isExpanded} />
          <TreeItemIcon kind={isExpanded ? 'openFolder' : 'folder'} />
          <span class="name">{folder.fileName}</span>
        </div>
        {#if isExpanded}
          <FolderContents
            folderPath={folder.displayPath}
            level={level + 1}
            {translator}
            {folderRevisions}
            {activeDocumentKey}
            {shouldRevealActiveDocument}
            {onListFolder}
            {onShowFolder}
            {onOpenDocument}
          />
        {/if}
      </li>
    {/each}
    {#each listing.documents as document (document.canonicalKey)}
      {@const isActive = document.canonicalKey === activeDocumentKey}
      <li role="none">
        <div
          role="treeitem"
          tabindex="-1"
          aria-level={level}
          aria-selected={isActive}
          class:selected={isActive}
          title={document.displayPath}
          use:scrollIntoViewWhen={isActive && shouldRevealActiveDocument}
          onclick={() => onOpenDocument(document.displayPath)}
          onkeydown={activateWithKeyboard}
        >
          <span class="chevron-space" aria-hidden="true"></span>
          <TreeItemIcon kind="document" />
          <span class="name">{document.fileName}</span>
        </div>
      </li>
    {/each}
  {/if}
</ul>

<style>
  .folder-contents {
    margin-inline-start: calc(var(--space-2) + 8px) !important;
    padding-inline-start: var(--space-1) !important;
    border-inline-start: 1px solid var(--color-border);
  }

  .chevron-space {
    flex: none;
    width: 16px;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .folder-status {
    color: var(--color-text-secondary) !important;
    font-size: var(--text-size-small) !important;
  }
</style>
