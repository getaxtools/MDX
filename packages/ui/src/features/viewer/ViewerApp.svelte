<script lang="ts">
  import type { Favourite, RecentFile } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import type { CodeHighlighter } from '@mdx/renderer';
  import AboutDialog from '../about/AboutDialog.svelte';
  import type { AppInfo } from '../about/AppInfo';
  import ConfirmDialog from '../../components/ConfirmDialog.svelte';
  import type { DocumentLink } from '../document-view/DocumentLink';
  import DocumentView from '../document-view/DocumentView.svelte';
  import FavouritesSidebar from '../favourites/FavouritesSidebar.svelte';
  import KeyboardShortcutsDialog from '../help/KeyboardShortcutsDialog.svelte';
  import OutlinePanel from '../outline/OutlinePanel.svelte';
  import type { TabCommand } from '../tabs/tabCommands';
  import TabStripView from '../tabs/TabStripView.svelte';
  import { applyTheme } from '../view/applyTheme';
  import StatusBar from '../view/StatusBar.svelte';
  import ViewOptions from '../view/ViewOptions.svelte';
  import NoticeBar from './NoticeBar.svelte';
  import { commandForShortcut, type DesktopPlatform, type ViewerCommand } from './viewerCommands';
  import type { ViewerController, ViewerSnapshot } from './ViewerController';

  interface Props {
    controller: ViewerController;
    translator: Translator;
    platform: DesktopPlatform;
    appInfo: AppInfo;
    codeHighlighter?: CodeHighlighter;
  }

  const { controller, translator, platform, appInfo, codeHighlighter }: Props = $props();

  let snapshot: ViewerSnapshot | undefined = $state();
  let currentHeadingId: string | undefined = $state();
  $effect(() => controller.subscribe((latest) => (snapshot = latest)));

  $effect(() => {
    if (snapshot) applyTheme(globalThis.document.documentElement, snapshot.viewer.viewSettings.theme);
  });

  const activeTab = $derived(snapshot?.viewer.tabStrip.activeTab());
  const isActiveFavourite = $derived(
    activeTab ? (snapshot?.viewer.favourites.isFavourite(activeTab.location.canonicalKey) ?? false) : false,
  );

  // The webview's own menu offers browser actions such as Back and Refresh that make no sense in the app.
  function preventBrowserContextMenu(event: MouseEvent) {
    event.preventDefault();
  }

  function handleKeydown(event: KeyboardEvent) {
    const command = commandForShortcut(event, platform);
    if (!command) return;
    event.preventDefault();
    void controller.execute(command);
  }
</script>

<svelte:window onkeydown={handleKeydown} oncontextmenu={preventBrowserContextMenu} />

{#if snapshot}
  {@const viewSettings = snapshot.viewer.viewSettings}
  <div class="viewer" class:without-sidebar={!viewSettings.isSidebarVisible}>
    {#if viewSettings.isSidebarVisible}
      <FavouritesSidebar
        favourites={snapshot.viewer.favourites.favourites()}
        recentFiles={snapshot.viewer.recentFiles.entries()}
        pathStatuses={snapshot.pathStatuses}
        onCommand={(command: ViewerCommand) => void controller.execute(command)}
        onListFolder={(folderPath: string) => controller.listFolderDocuments(folderPath)}
        onOpenDocument={(documentPath: string) => void controller.openDocuments([documentPath])}
        {translator}
        onOpenFavourite={(favourite: Favourite) => void controller.openFavourite(favourite)}
        onOpenRecentFile={(recentFile: RecentFile) => void controller.openRecentFile(recentFile)}
      />
    {/if}
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
        <ViewOptions
          settings={viewSettings}
          {translator}
          onCommand={(command: ViewerCommand) => void controller.execute(command)}
        />
      </div>
      <NoticeBar message={snapshot.notice} {translator} onDismiss={() => controller.dismissNotice()} />
      <TabStripView
        tabs={snapshot.viewer.tabStrip.tabs()}
        activeKey={activeTab?.location.canonicalKey}
        pathStatuses={snapshot.pathStatuses}
        {translator}
        onActivate={(canonicalKey: string) => controller.activateTab(canonicalKey)}
        onCommand={(command: TabCommand) => void controller.execute(command)}
      />
      <div class="reading-area">
        <DocumentView
          document={snapshot.activeDocument}
          zoomPercent={viewSettings.zoomPercent}
          readingWidth={viewSettings.readingWidth}
          {codeHighlighter}
          findRequest={snapshot.findRequest}
          isSourceView={snapshot.isSourceView ?? false}
          onCloseFind={() => controller.closeFind()}
          {translator}
          onOpenLink={(link: DocumentLink) => void controller.openLink(link)}
          onScroll={(scrollRatio: number) => controller.rememberScrollPosition(scrollRatio)}
          onCurrentHeadingChange={(headingId: string | undefined) => (currentHeadingId = headingId)}
        />
        {#if snapshot.activeDocument && viewSettings.isOutlineVisible}
          <OutlinePanel outline={snapshot.activeDocument.outline} {currentHeadingId} {translator} />
        {/if}
      </div>
      <StatusBar document={snapshot.activeDocument} {translator} />
    </div>
  </div>
  {#if snapshot.externalLinkRequest !== undefined}
    <ConfirmDialog
      title={translator.translate('document.openExternalLink.title')}
      message={translator.translate('document.openExternalLink.body', { url: snapshot.externalLinkRequest })}
      confirmLabel={translator.translate('document.openExternalLink.open')}
      cancelLabel={translator.translate('document.openExternalLink.cancel')}
      onConfirm={() => controller.answerExternalLink(true)}
      onCancel={() => controller.answerExternalLink(false)}
    />
  {/if}
  {#if snapshot.openDialog === 'about'}
    <AboutDialog {appInfo} {translator} onClose={() => controller.closeDialog()} />
  {:else if snapshot.openDialog === 'keyboardShortcuts'}
    <KeyboardShortcutsDialog {translator} onClose={() => controller.closeDialog()} />
  {/if}
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

  .viewer.without-sidebar {
    grid-template-columns: 1fr;
  }

  .workspace {
    display: grid;
    grid-template-rows: auto auto auto 1fr auto;
    min-width: 0;
    min-height: 0;
  }

  .reading-area {
    display: flex;
    min-height: 0;
  }

  .reading-area > :global(main) {
    flex: 1;
    min-width: 0;
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
