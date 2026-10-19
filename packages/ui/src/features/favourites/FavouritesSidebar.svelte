<script lang="ts">
  import type { Favourite, FavouriteGroup, RecentFile } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import type { FolderListing, PathStatus } from '@mdx/platform';
  import type { LocateRecentFileCommand, RecentFileCommand } from '../recent-files/recentFileCommands';
  import RecentFilesSection from '../recent-files/RecentFilesSection.svelte';
  import type { FavouriteCommand, FavouritesFileCommand } from './favouriteCommands';
  import FavouritesSection from './FavouritesSection.svelte';

  interface Props {
    favourites: readonly Favourite[];
    favouriteGroups?: readonly FavouriteGroup[];
    recentFiles: readonly RecentFile[];
    pathStatuses: ReadonlyMap<string, PathStatus>;
    translator: Translator;
    onOpenFavourite: (favourite: Favourite) => void;
    onOpenRecentFile: (recentFile: RecentFile) => void;
    onCommand: (
      command: FavouriteCommand | FavouritesFileCommand | RecentFileCommand | LocateRecentFileCommand,
    ) => void;
    onListFolder: (folderPath: string) => Promise<FolderListing>;
    onOpenDocument: (documentPath: string) => void;
  }

  const {
    favourites,
    favouriteGroups = [],
    recentFiles,
    pathStatuses,
    translator,
    onOpenFavourite,
    onOpenRecentFile,
    onCommand,
    onListFolder,
    onOpenDocument,
  }: Props = $props();
</script>

<nav class="sidebar" aria-label={translator.translate('sidebar.label')}>
  <FavouritesSection
    {favourites}
    groups={favouriteGroups}
    {pathStatuses}
    {translator}
    onOpen={onOpenFavourite}
    {onCommand}
    {onListFolder}
    {onOpenDocument}
  />
  <RecentFilesSection {recentFiles} {pathStatuses} {translator} onOpen={onOpenRecentFile} {onCommand} />
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

  .sidebar :global(h2) {
    margin: 0 var(--space-2) var(--space-2);
    font-size: var(--text-size-small);
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .sidebar :global(ul) {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .sidebar :global(li > button),
  .sidebar :global(li > input) {
    display: flex;
    gap: var(--space-2);
    width: 100%;
    box-sizing: border-box;
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

  .sidebar :global(li > input) {
    border: 1px solid var(--color-focus);
    background: var(--color-background);
  }

  .sidebar :global(li > button:hover) {
    background: var(--color-surface-hover);
  }

  .sidebar :global(li > button.unavailable) {
    color: var(--color-text-secondary);
    font-style: italic;
  }

  .sidebar :global(li > button:focus-visible) {
    outline: 2px solid var(--color-focus);
  }

  .sidebar :global(.empty-state) {
    margin: 0 var(--space-2);
    font-size: var(--text-size-small);
    color: var(--color-text-secondary);
  }
</style>
