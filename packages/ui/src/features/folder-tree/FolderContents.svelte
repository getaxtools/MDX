<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import type { FolderListing } from '@mdx/platform';
  import { SvelteSet } from 'svelte/reactivity';
  import FolderContents from './FolderContents.svelte';
  import TreeChevron from './TreeChevron.svelte';
  import TreeItemIcon from './TreeItemIcon.svelte';

  interface Props {
    folderPath: string;
    translator: Translator;
    folderRevisions: ReadonlyMap<string, number>;
    onListFolder: (folderPath: string) => Promise<FolderListing>;
    onShowFolder: (folderPath: string) => () => void;
    onOpenDocument: (documentPath: string) => void;
  }

  const { folderPath, translator, folderRevisions, onListFolder, onShowFolder, onOpenDocument }: Props =
    $props();

  const revision = $derived(folderRevisions.get(folderPath) ?? 0);
  const expandedSubfolderKeys = new SvelteSet<string>();
  let listing: FolderListing | undefined = $state();

  $effect(() => onShowFolder(folderPath));

  $effect(() => {
    const requestedRevision = revision;
    void onListFolder(folderPath).then((nextListing) => {
      if (requestedRevision === revision) listing = nextListing;
    });
  });

  function toggleSubfolder(key: string) {
    if (expandedSubfolderKeys.has(key)) expandedSubfolderKeys.delete(key);
    else expandedSubfolderKeys.add(key);
  }
</script>

{#if listing === undefined}
  <p class="folder-status">{translator.translate('favourites.folder.loading')}</p>
{:else if listing.folders.length === 0 && listing.documents.length === 0}
  <p class="folder-status">{translator.translate('favourites.folder.empty')}</p>
{:else}
  <ul class="folder-contents">
    {#each listing.folders as folder (folder.canonicalKey)}
      {@const isExpanded = expandedSubfolderKeys.has(folder.canonicalKey)}
      <li>
        <button
          title={folder.displayPath}
          aria-expanded={isExpanded}
          onclick={() => toggleSubfolder(folder.canonicalKey)}
        >
          <TreeChevron {isExpanded} />
          <TreeItemIcon kind={isExpanded ? 'openFolder' : 'folder'} />
          <span class="name">{folder.fileName}</span>
        </button>
        {#if isExpanded}
          <FolderContents
            folderPath={folder.displayPath}
            {translator}
            {folderRevisions}
            {onListFolder}
            {onShowFolder}
            {onOpenDocument}
          />
        {/if}
      </li>
    {/each}
    {#each listing.documents as document (document.canonicalKey)}
      <li>
        <button title={document.displayPath} onclick={() => onOpenDocument(document.displayPath)}>
          <span class="chevron-space" aria-hidden="true"></span>
          <TreeItemIcon kind="document" />
          <span class="name">{document.fileName}</span>
        </button>
      </li>
    {/each}
  </ul>
{/if}

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
    margin: 0;
    padding: var(--space-1) var(--space-2) var(--space-1) var(--space-6);
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
  }
</style>
