<script lang="ts">
  import type { Favourite, RecentFile } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import type { CodeHighlighter, RichBlockRenderer } from '@mdx/renderer';
  import CommandPalette from '../command-palette/CommandPalette.svelte';
  import { paletteCommands } from '../command-palette/paletteCommands';
  import ExplorerSidebar from '../explorer/ExplorerSidebar.svelte';
  import SourceEditorPane from '../editing/SourceEditorPane.svelte';
  import AboutDialog from '../about/AboutDialog.svelte';
  import type { AppInfo } from '../about/AppInfo';
  import type { ThirdPartyLicensesLoader } from '../about/ThirdPartyLicenses';
  import ConfirmDialog from '../../components/ConfirmDialog.svelte';
  import type { DocumentLink } from '../document-view/DocumentLink';
  import DocumentView from '../document-view/DocumentView.svelte';
  import { isUntitledLocation } from '@mdx/platform';
  import KeyboardShortcutsDialog from '../help/KeyboardShortcutsDialog.svelte';
  import PasteTableDialog from '../table-paste/PasteTableDialog.svelte';
  import OutlinePanel from '../outline/OutlinePanel.svelte';
  import type { TabCommand } from '../tabs/tabCommands';
  import TabStripView from '../tabs/TabStripView.svelte';
  import { applyTheme } from '../view/applyTheme';
  import ActivityBar from '../view/ActivityBar.svelte';
  import StatusBar from '../view/StatusBar.svelte';
  import ViewOptions from '../view/ViewOptions.svelte';
  import NoticeBar from './NoticeBar.svelte';
  import { commandForShortcut } from '../shortcuts/commandShortcuts';
  import type { DesktopPlatform, ViewerCommand } from './viewerCommands';
  import type { NoticeAction, ViewerController, ViewerSnapshot } from './ViewerController';

  interface Props {
    controller: ViewerController;
    translator: Translator;
    platform: DesktopPlatform;
    appInfo: AppInfo;
    codeHighlighter?: CodeHighlighter;
    richBlocks?: RichBlockRenderer;
    loadThirdPartyLicenses?: ThirdPartyLicensesLoader;
  }

  const {
    controller,
    translator,
    platform,
    appInfo,
    codeHighlighter,
    richBlocks,
    loadThirdPartyLicenses,
  }: Props = $props();

  // Raw, not deep state: a deep proxy gives the same document a new identity on every
  // snapshot, and the document view treats that as a newly opened document.
  let snapshot: ViewerSnapshot | undefined = $state.raw();
  let currentHeadingId: string | undefined = $state();
  $effect(() => controller.subscribe((latest) => (snapshot = latest)));

  $effect(() => {
    if (snapshot) applyTheme(globalThis.document.documentElement, snapshot.viewer.viewSettings.theme);
  });

  const activeTab = $derived(snapshot?.viewer.tabStrip.activeTab());
  /** The document in the editor, once the shown document has caught up with the active tab. */
  const editedDocument = $derived(
    snapshot?.isActiveDocumentEditing &&
      snapshot.activeDocument?.canonicalKey === activeTab?.location.canonicalKey
      ? snapshot.activeDocument
      : undefined,
  );
  const isActiveUntitled = $derived(activeTab ? isUntitledLocation(activeTab.location) : false);
  const isActiveFavourite = $derived(
    activeTab ? (snapshot?.viewer.favourites.isFavourite(activeTab.location.canonicalKey) ?? false) : false,
  );

  // The webview's own menu offers browser actions such as Back and Refresh that make no sense in the app.
  function preventBrowserContextMenu(event: MouseEvent) {
    event.preventDefault();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented) return;
    const command = commandForShortcut(event, platform);
    if (!command) return;
    event.preventDefault();
    void controller.execute(command);
  }
</script>

<svelte:window onkeydown={handleKeydown} oncontextmenu={preventBrowserContextMenu} />

{#if snapshot}
  {@const viewSettings = snapshot.viewer.viewSettings}
  <div class="app-shell">
    <div class="viewer" class:without-sidebar={!viewSettings.isSidebarVisible}>
      <ActivityBar
        isSidebarVisible={viewSettings.isSidebarVisible}
        isOutlineVisible={viewSettings.isOutlineVisible}
        {translator}
        onCommand={(command: ViewerCommand) => void controller.execute(command)}
      />
      {#if viewSettings.isSidebarVisible}
        <ExplorerSidebar
          favourites={snapshot.viewer.favourites.favourites()}
          favouriteGroups={snapshot.viewer.favourites.groups()}
          explorerFolders={snapshot.viewer.explorerFolders.folders()}
          collapsedSections={viewSettings.collapsedExplorerSections}
          sectionHeights={viewSettings.explorerSectionHeights}
          activeDocumentKey={activeTab?.location.canonicalKey}
          recentFiles={snapshot.viewer.recentFiles.entries()}
          pathStatuses={snapshot.pathStatuses}
          onCommand={(command: ViewerCommand) => void controller.execute(command)}
          onListFolder={(folderPath: string) => controller.listFolderContents(folderPath)}
          folderRevisions={snapshot.folderRevisions}
          onShowFolder={(folderPath: string) => controller.showFolder(folderPath)}
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
            disabled={!activeTab || isActiveUntitled}
            onclick={() => void controller.execute({ kind: 'toggleFavourite' })}
          >
            <span aria-hidden="true">{isActiveFavourite ? '★' : '☆'}</span>
            {translator.translate('favourites.toggle')}
          </button>
          <button
            aria-pressed={snapshot.isActiveDocumentEditing ?? false}
            disabled={!snapshot.activeDocument}
            onclick={() => void controller.execute({ kind: 'toggleEditing' })}
          >
            {translator.translate(snapshot.isActiveDocumentEditing ? 'toolbar.preview' : 'toolbar.edit')}
          </button>
          <ViewOptions
            settings={viewSettings}
            {translator}
            onCommand={(command: ViewerCommand) => void controller.execute(command)}
          />
        </div>
        <NoticeBar
          message={snapshot.notice}
          actions={snapshot.noticeActions}
          {translator}
          onAction={(action: NoticeAction) => void controller.runNoticeAction(action)}
          onDismiss={() => controller.dismissNotice()}
        />
        <TabStripView
          tabs={snapshot.viewer.tabStrip.tabs()}
          activeKey={activeTab?.location.canonicalKey}
          pathStatuses={snapshot.pathStatuses}
          unsavedKeys={snapshot.unsavedDocumentKeys}
          {translator}
          onActivate={(canonicalKey: string) => controller.activateTab(canonicalKey)}
          onCommand={(command: TabCommand) => void controller.execute(command)}
        />
        <div class="reading-area">
          {#if editedDocument}
            {#key editedDocument.canonicalKey}
              <SourceEditorPane
                canonicalKey={editedDocument.canonicalKey}
                fileName={editedDocument.fileName}
                text={editedDocument.source}
                zoomPercent={viewSettings.zoomPercent}
                scrollRatio={editedDocument.scrollRatio}
                {translator}
                editorRequest={snapshot.editorRequest}
                onScroll={(scrollRatio: number) => controller.rememberScrollPosition(scrollRatio)}
                onChange={(text: string) => controller.updateEditedText(editedDocument.canonicalKey, text)}
              />
            {/key}
          {:else}
            <DocumentView
              document={snapshot.activeDocument}
              zoomPercent={viewSettings.zoomPercent}
              readingWidth={viewSettings.readingWidth}
              {codeHighlighter}
              {richBlocks}
              findRequest={snapshot.findRequest}
              isSourceView={snapshot.isSourceView ?? false}
              onCloseFind={() => controller.closeFind()}
              {translator}
              onOpenLink={(link: DocumentLink) => void controller.openLink(link)}
              onScroll={(scrollRatio: number) => controller.rememberScrollPosition(scrollRatio)}
              onCurrentHeadingChange={(headingId: string | undefined) => (currentHeadingId = headingId)}
              onCommand={(command: ViewerCommand) => void controller.execute(command)}
              isOutlineVisible={viewSettings.isOutlineVisible}
              isFavourite={isActiveFavourite}
              canBeFavourite={!isActiveUntitled}
            />
          {/if}
          {#if snapshot.activeDocument && viewSettings.isOutlineVisible && !snapshot.isActiveDocumentEditing}
            <OutlinePanel outline={snapshot.activeDocument.outline} {currentHeadingId} {translator} />
          {/if}
        </div>
      </div>
    </div>
    {#if viewSettings.isStatusBarVisible}
      <StatusBar
        document={snapshot.activeDocument}
        zoomPercent={viewSettings.zoomPercent}
        isSourceView={snapshot.isSourceView ?? false}
        isEditing={snapshot.isActiveDocumentEditing ?? false}
        hasUnsavedChanges={activeTab
          ? snapshot.unsavedDocumentKeys.has(activeTab.location.canonicalKey)
          : false}
        {translator}
        onResetZoom={() => void controller.execute({ kind: 'resetZoom' })}
        onReopenWithEncoding={(encoding: string | undefined) =>
          void controller.execute(
            encoding === undefined
              ? { kind: 'reopenWithEncoding' }
              : { kind: 'reopenWithEncoding', encoding },
          )}
      />
    {/if}
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
    <AboutDialog {appInfo} {translator} {loadThirdPartyLicenses} onClose={() => controller.closeDialog()} />
  {:else if snapshot.openDialog === 'keyboardShortcuts'}
    <KeyboardShortcutsDialog {translator} onClose={() => controller.closeDialog()} />
  {:else if snapshot.openDialog === 'pasteTable'}
    <PasteTableDialog
      {translator}
      renderPreview={(markdown: string) => controller.renderPreview(markdown)}
      onOpenAsNewDocument={(markdown: string) => controller.openAsNewDocument(markdown)}
      onClose={() => controller.closeDialog()}
    />
  {:else if snapshot.openDialog === 'commandPalette'}
    <CommandPalette
      {translator}
      commands={paletteCommands(translator)}
      loadDocuments={() => controller.quickOpenDocuments()}
      onRunCommand={(command: ViewerCommand) => void controller.execute(command)}
      onOpenDocument={(documentPath: string) => void controller.openDocuments([documentPath])}
      onClose={() => controller.closeDialog()}
    />
  {/if}
  {#if snapshot.unsavedChanges}
    {@const fileNames = snapshot.unsavedChanges.fileNames}
    <ConfirmDialog
      title={translator.translate('saving.unsavedDialog.title')}
      message={translator.translate('saving.unsavedDialog.message', {
        count: fileNames.length,
        fileName: fileNames[0] ?? '',
      })}
      confirmLabel={translator.translate('saving.unsavedDialog.save')}
      cancelLabel={translator.translate('saving.unsavedDialog.cancel')}
      alternative={{
        label: translator.translate('saving.unsavedDialog.discard'),
        onChoose: () => void controller.answerUnsavedChanges('discard'),
      }}
      onConfirm={() => void controller.answerUnsavedChanges('save')}
      onCancel={() => void controller.answerUnsavedChanges('cancel')}
    />
  {/if}
{/if}

<style>
  .app-shell {
    display: grid;
    grid-template-rows: 1fr auto;
    height: 100vh;
    font-family: var(--font-ui);
    color: var(--color-text);
    background: var(--color-background);
  }

  .viewer {
    display: grid;
    grid-template-columns: auto minmax(180px, 260px) 1fr;
    min-height: 0;
  }

  .viewer.without-sidebar {
    grid-template-columns: auto 1fr;
  }

  .workspace {
    display: grid;
    grid-template-rows: auto auto auto 1fr;
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
