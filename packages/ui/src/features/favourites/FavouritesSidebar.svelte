<script lang="ts">
  import { displayNameOf, type Favourite, type RecentFile } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';

  interface Props {
    favourites: readonly Favourite[];
    recentFiles: readonly RecentFile[];
    translator: Translator;
    onOpenFavourite: (favourite: Favourite) => void;
    onOpenRecentFile: (recentFile: RecentFile) => void;
  }

  const { favourites, recentFiles, translator, onOpenFavourite, onOpenRecentFile }: Props = $props();
</script>

<nav class="sidebar" aria-label={translator.translate('sidebar.label')}>
  <section aria-labelledby="favourites-heading">
    <h2 id="favourites-heading">{translator.translate('favourites.sidebar.title')}</h2>
    {#if favourites.length === 0}
      <p class="empty-state">{translator.translate('favourites.sidebar.emptyState')}</p>
    {:else}
      <ul>
        {#each favourites as favourite (favourite.location.canonicalKey)}
          <li>
            <button title={favourite.location.displayPath} onclick={() => onOpenFavourite(favourite)}>
              <span aria-hidden="true">★</span>
              {displayNameOf(favourite)}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section aria-labelledby="recent-files-heading">
    <h2 id="recent-files-heading">{translator.translate('recentFiles.title')}</h2>
    {#if recentFiles.length === 0}
      <p class="empty-state">{translator.translate('recentFiles.emptyState')}</p>
    {:else}
      <ul>
        {#each recentFiles as recentFile (recentFile.location.canonicalKey)}
          <li>
            <button title={recentFile.location.displayPath} onclick={() => onOpenRecentFile(recentFile)}>
              {recentFile.location.fileName}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</nav>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-2);
    background: var(--color-surface);
    border-inline-end: 1px solid var(--color-border);
    overflow-y: auto;
  }

  h2 {
    margin: 0 var(--space-2) var(--space-2);
    font-size: var(--text-size-small);
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  button {
    display: flex;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-1) var(--space-2);
    border: 0;
    border-radius: var(--radius-small);
    background: none;
    color: var(--color-text);
    font: inherit;
    font-size: var(--text-size-body);
    text-align: start;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  button:hover {
    background: var(--color-surface-hover);
  }

  button:focus-visible {
    outline: 2px solid var(--color-focus);
  }

  .empty-state {
    margin: 0 var(--space-2);
    font-size: var(--text-size-small);
    color: var(--color-text-secondary);
  }
</style>
