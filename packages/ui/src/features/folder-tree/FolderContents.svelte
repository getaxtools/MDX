<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import type { FolderListing } from '@mdx/platform';
  import { SvelteSet } from 'svelte/reactivity';
  import FolderContents from './FolderContents.svelte';

  interface Props {
    folderPath: string;
    translator: Translator;
    onListFolder: (folderPath: string) => Promise<FolderListing>;
    onOpenDocument: (documentPath: string) => void;
  }

  const { folderPath, translator, onListFolder, onOpenDocument }: Props = $props();

  const listing = $derived(onListFolder(folderPath));
  const expandedSubfolderKeys = new SvelteSet<string>();

  function toggleSubfolder(key: string) {
    if (expandedSubfolderKeys.has(key)) expandedSubfolderKeys.delete(key);
    else expandedSubfolderKeys.add(key);
  }
</script>

{#await listing}
  <p class="folder-status">{translator.translate('favourites.folder.loading')}</p>
{:then { folders, documents }}
  {#if folders.length === 0 && documents.length === 0}
    <p class="folder-status">{translator.translate('favourites.folder.empty')}</p>
  {:else}
    <ul class="folder-contents">
      {#each folders as folder (folder.canonicalKey)}
        <li>
          <button
            title={folder.displayPath}
            aria-expanded={expandedSubfolderKeys.has(folder.canonicalKey)}
            onclick={() => toggleSubfolder(folder.canonicalKey)}
          >
            <span aria-hidden="true">📁</span>
            {folder.fileName}
          </button>
          {#if expandedSubfolderKeys.has(folder.canonicalKey)}
            <FolderContents folderPath={folder.displayPath} {translator} {onListFolder} {onOpenDocument} />
          {/if}
        </li>
      {/each}
      {#each documents as document (document.canonicalKey)}
        <li>
          <button title={document.displayPath} onclick={() => onOpenDocument(document.displayPath)}>
            {document.fileName}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
{/await}

<style>
  .folder-contents {
    padding-inline-start: var(--space-4) !important;
  }

  .folder-status {
    margin: 0;
    padding: var(--space-1) var(--space-2) var(--space-1) var(--space-6);
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
  }
</style>
