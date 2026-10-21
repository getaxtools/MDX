<script lang="ts">
  import type { ExplorerSection, Favourite, FavouriteGroup, RecentFile } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import type { DocumentLocation, FolderListing, PathStatus } from '@mdx/platform';
  import FavouritesSection from '../favourites/FavouritesSection.svelte';
  import RecentFilesSection from '../recent-files/RecentFilesSection.svelte';
  import type { ViewerCommand } from '../viewer/viewerCommands';
  import ExplorerFoldersSection from './ExplorerFoldersSection.svelte';
  import SectionResizer from './SectionResizer.svelte';

  interface Props {
    favourites: readonly Favourite[];
    favouriteGroups?: readonly FavouriteGroup[];
    explorerFolders?: readonly DocumentLocation[];
    recentFiles: readonly RecentFile[];
    collapsedSections?: readonly ExplorerSection[];
    sectionHeights?: Readonly<Partial<Record<ExplorerSection, number>>>;
    pathStatuses: ReadonlyMap<string, PathStatus>;
    translator: Translator;
    onOpenFavourite: (favourite: Favourite) => void;
    onOpenRecentFile: (recentFile: RecentFile) => void;
    onCommand: (command: ViewerCommand) => void;
    onListFolder: (folderPath: string) => Promise<FolderListing>;
    onOpenDocument: (documentPath: string) => void;
    folderRevisions?: ReadonlyMap<string, number>;
    onShowFolder?: (folderPath: string) => () => void;
    activeDocumentKey?: string | undefined;
  }

  const {
    favourites,
    favouriteGroups = [],
    explorerFolders = [],
    recentFiles,
    collapsedSections = [],
    sectionHeights = {},
    pathStatuses,
    translator,
    onOpenFavourite,
    onOpenRecentFile,
    onCommand,
    onListFolder,
    onOpenDocument,
    folderRevisions = new Map(),
    onShowFolder = () => () => undefined,
    activeDocumentKey,
  }: Props = $props();

  const favouriteKeys = $derived(new Set(favourites.map((favourite) => favourite.location.canonicalKey)));

  function isExpanded(section: ExplorerSection): boolean {
    return !collapsedSections.includes(section);
  }

  const RESIZABLE_SECTIONS: readonly ExplorerSection[] = ['favourites', 'folders'];
  const SECTION_TITLE_KEYS = {
    favourites: 'favourites.sidebar.title',
    folders: 'explorer.folders.title',
    recentFiles: 'recentFiles.title',
  } as const;
  const sectionSlots: Partial<Record<ExplorerSection, HTMLDivElement>> = $state({});
  let previewHeights: Partial<Record<ExplorerSection, number>> = $state({});

  function heightOf(section: ExplorerSection): string | undefined {
    if (!isExpanded(section) || !RESIZABLE_SECTIONS.includes(section)) return undefined;
    const heightPx = previewHeights[section] ?? sectionHeights[section];
    return heightPx === undefined ? undefined : `${String(heightPx)}px`;
  }

  function resize(section: ExplorerSection, heightPx: number) {
    previewHeights = { ...previewHeights, [section]: undefined };
    onCommand({ kind: 'resizeExplorerSection', section, heightPx });
  }

  function toggle(section: ExplorerSection) {
    onCommand({ kind: 'toggleExplorerSection', section });
  }
</script>

{#snippet resizer(section: ExplorerSection)}
  {#if isExpanded(section)}
    <SectionResizer
      label={translator.translate('explorer.resizeSection', {
        section: translator.translate(SECTION_TITLE_KEYS[section]),
      })}
      measureHeight={() => sectionSlots[section]?.getBoundingClientRect().height ?? 0}
      onPreview={(heightPx: number) => (previewHeights = { ...previewHeights, [section]: heightPx })}
      onResize={(heightPx: number) => resize(section, heightPx)}
    />
  {/if}
{/snippet}

<nav class="sidebar" data-focus-region aria-label={translator.translate('sidebar.label')}>
  <div class="section-slot" style:height={heightOf('favourites')} bind:this={sectionSlots.favourites}>
    <FavouritesSection
      {favourites}
      {activeDocumentKey}
      groups={favouriteGroups}
      {pathStatuses}
      {translator}
      onOpen={onOpenFavourite}
      {onCommand}
      {onListFolder}
      {onOpenDocument}
      {folderRevisions}
      {onShowFolder}
      isExpanded={isExpanded('favourites')}
      onToggleExpanded={() => toggle('favourites')}
    />
  </div>
  <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- rendering a snippet is not a value -->
  {@render resizer('favourites')}
  <div class="section-slot" style:height={heightOf('folders')} bind:this={sectionSlots.folders}>
    <ExplorerFoldersSection
      folders={explorerFolders}
      {activeDocumentKey}
      {favouriteKeys}
      {pathStatuses}
      {translator}
      isExpanded={isExpanded('folders')}
      onToggleExpanded={() => toggle('folders')}
      {folderRevisions}
      {onListFolder}
      {onShowFolder}
      {onOpenDocument}
      {onCommand}
    />
  </div>
  <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- rendering a snippet is not a value -->
  {@render resizer('folders')}
  <RecentFilesSection
    {recentFiles}
    {pathStatuses}
    {translator}
    onOpen={onOpenRecentFile}
    {onCommand}
    isExpanded={isExpanded('recentFiles')}
    onToggleExpanded={() => toggle('recentFiles')}
  />
</nav>

<style>
  .section-slot {
    flex: none;
    min-height: 0;
    overflow-y: auto;
  }

  .sidebar {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
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

  .sidebar :global(li > [role='treeitem']),
  .sidebar :global(li > input) {
    display: flex;
    align-items: center;
    gap: var(--space-1);
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

  .sidebar :global(li > [role='treeitem']) {
    cursor: default;
  }

  .sidebar :global(li > [role='treeitem']:hover) {
    background: var(--color-surface-hover);
  }

  .sidebar :global(li > [role='treeitem'].selected) {
    background: var(--color-surface-selected);
  }

  .sidebar :global(li > [role='treeitem'].unavailable) {
    color: var(--color-text-secondary);
    font-style: italic;
  }

  .sidebar :global(li > [role='treeitem']:focus-visible) {
    outline: 2px solid var(--color-focus);
  }

  .sidebar :global(.empty-state) {
    margin: 0 var(--space-2);
    font-size: var(--text-size-small);
    color: var(--color-text-secondary);
  }
</style>
