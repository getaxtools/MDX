<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import type { DocumentLocation } from '@mdx/platform';

  interface Props {
    folderPath: string;
    translator: Translator;
    onListFolder: (folderPath: string) => Promise<readonly DocumentLocation[]>;
    onOpenDocument: (documentPath: string) => void;
  }

  const { folderPath, translator, onListFolder, onOpenDocument }: Props = $props();

  const documents = $derived(onListFolder(folderPath));
</script>

{#await documents}
  <p class="folder-status">{translator.translate('favourites.folder.loading')}</p>
{:then locations}
  {#if locations.length === 0}
    <p class="folder-status">{translator.translate('favourites.folder.empty')}</p>
  {:else}
    <ul class="folder-contents">
      {#each locations as location (location.canonicalKey)}
        <li>
          <button title={location.displayPath} onclick={() => onOpenDocument(location.displayPath)}>
            {location.fileName}
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
