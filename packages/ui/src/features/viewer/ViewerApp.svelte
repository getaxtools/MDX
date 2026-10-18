<script lang="ts">
  import type { Favourite, RecentFile } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import DocumentView from '../document-view/DocumentView.svelte';
  import FavouritesSidebar from '../favourites/FavouritesSidebar.svelte';
  import TabStripView from '../tabs/TabStripView.svelte';
  import NoticeBar from './NoticeBar.svelte';
  import { commandForShortcut, type DesktopPlatform } from './viewerCommands';
  import type { ViewerController, ViewerSnapshot } from './ViewerController';

  interface Props {
    controller: ViewerController;
    translator: Translator;
    platform: DesktopPlatform;
  }

  const { controller, translator, platform }: Props = $props();

  let snapshot: ViewerSnapshot | undefined = $state();
  $effect(() => controller.subscribe((latest) => (snapshot = latest)));

  const activeTab = $derived(snapshot?.viewer.tabStrip.activeTab());
  const isActiveFavourite = $derived(
    activeTab ? (snapshot?.viewer.favourites.isFavourite(activeTab.location.canonicalKey) ?? false) : false,
  );

  function handleKeydown(event: KeyboardEvent) {
    const command = commandForShortcut(event, platform);
    if (!command) return;
    event.preventDefault();
    void controller.execute(command);
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if snapshot}
  <div class="viewer">
    <FavouritesSidebar
      favourites={snapshot.viewer.favourites.favourites()}
      recentFiles={snapshot.viewer.recentFiles.entries()}
      {translator}
      onOpenFavourite={(favourite: Favourite) => void controller.openFavourite(favourite)}
      onOpenRecentFile={(recentFile: RecentFile) => void controller.openRecentFile(recentFile)}
    />
    <div class="workspace">
      <div class="toolbar" role="toolbar" aria-label={translator.translate('toolbar.label')}>
        <button onclick={() => void controller.execute({ kind: 'openDocuments' })}>
          {translator.translate('toolbar.open')}
        </button>
        <button
          aria-pressed={isActiveFavourite}
          disabled={!activeTab}
          onclick={() => void controller.execute({ kind: 'toggleFavourite' })}
        >
          <span aria-hidden="true">{isActiveFavourite ? '★' : '☆'}</span>
          {translator.translate('favourites.toggle')}
        </button>
      </div>
      <NoticeBar message={snapshot.notice} {translator} onDismiss={() => controller.dismissNotice()} />
      <TabStripView
        tabs={snapshot.viewer.tabStrip.tabs()}
        activeKey={activeTab?.location.canonicalKey}
        {translator}
        onActivate={(canonicalKey: string) => controller.activateTab(canonicalKey)}
        onClose={(canonicalKey: string) => controller.closeTab(canonicalKey)}
      />
      <DocumentView
        document={snapshot.activeDocument}
        {translator}
        onUnsupportedLink={() => controller.showNotice('document.linkNotSupportedYet')}
      />
    </div>
  </div>
{/if}

<style>
  .viewer {
    display: grid;
    grid-template-columns: minmax(180px, 260px) 1fr;
    height: 100vh;
    font-family: var(--font-ui);
    color: var(--color-text);
    background: var(--color-background);
  }

  .workspace {
    display: grid;
    grid-template-rows: auto auto auto 1fr;
    min-width: 0;
    min-height: 0;
  }

  .toolbar {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--color-border);
  }

  .toolbar button {
    display: flex;
    gap: var(--space-1);
    align-items: center;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-small);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    font-size: var(--text-size-body);
  }

  .toolbar button:hover:not(:disabled) {
    background: var(--color-surface-hover);
  }

  .toolbar button:disabled {
    color: var(--color-text-secondary);
  }

  .toolbar button:focus-visible {
    outline: 2px solid var(--color-focus);
  }
</style>
