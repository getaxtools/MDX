<script lang="ts">
  import {
    DEFAULT_EDITOR_SHARE_PERCENT,
    isSidebarViewShown,
    MAX_PANEL_WIDTH_PX,
    MIN_PANEL_WIDTH_PX,
    panelWidthOf,
    type Favourite,
    type RecentFile,
    type ResizablePanel,
  } from '@mdx/core';
  import type { SourceEditor } from '@mdx/editor';
  import type { Translator } from '@mdx/i18n';
  import type { CodeHighlighter, OutlineEntry, RichBlockRenderer } from '@mdx/renderer';
  import CommandPalette from '../command-palette/CommandPalette.svelte';
  import { paletteCommands } from '../command-palette/paletteCommands';
  import ExplorerSidebar from '../explorer/ExplorerSidebar.svelte';
  import FolderSearchPanel from '../folder-search/FolderSearchPanel.svelte';
  import EditingLayout from '../editing/EditingLayout.svelte';
  import type { ScrollSync } from '../editing/ScrollSync';
  import SourceEditorPane from '../editing/SourceEditorPane.svelte';
  import PanelResizer from '../../components/PanelResizer.svelte';
  import SettingsDialog from '../settings/SettingsDialog.svelte';
  import StartPage from '../start-page/StartPage.svelte';
  import AboutDialog from '../about/AboutDialog.svelte';
  import type { AppInfo } from '../about/AppInfo';
  import type { ThirdPartyLicensesLoader } from '../about/ThirdPartyLicenses';
  import ConfirmDialog from '../../components/ConfirmDialog.svelte';
  import type { DocumentLink } from '../document-view/DocumentLink';
  import DocumentView from '../document-view/DocumentView.svelte';
  import { isUntitledLocation, type TextSearchOptions } from '@mdx/platform';
  import KeyboardShortcutsDialog from '../help/KeyboardShortcutsDialog.svelte';
  import PasteTableDialog from '../table-paste/PasteTableDialog.svelte';
  import OutlinePanel from '../outline/OutlinePanel.svelte';
  import type { HeadingRequest } from '../outline/HeadingRequest';
  import { headingIdAtLine } from '../outline/headingIdAtLine';
  import TabStripView from '../tabs/TabStripView.svelte';
  import Breadcrumbs from '../breadcrumbs/Breadcrumbs.svelte';
  import { applyTheme } from '../view/applyTheme';
  import ActivityBar from '../view/ActivityBar.svelte';
  import StatusBar from '../view/StatusBar.svelte';
  import ViewOptions from '../view/ViewOptions.svelte';
  import NoticeBar from './NoticeBar.svelte';
  import { moveFocusBetweenRegions } from './focusRegions';
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
  $effect(() => controller.subscribe((latest) => (snapshot = latest)));

  $effect(() => {
    if (snapshot) applyTheme(globalThis.document.documentElement, snapshot.viewer.viewSettings.theme);
  });

  const activeTab = $derived(snapshot?.viewer.tabStrip.activeTab());
  const activeKey = $derived(activeTab?.location.canonicalKey);
  let headingRequest: HeadingRequest | undefined = $state();
  let shownEditor: SourceEditor | undefined;
  /** Kept with its document, so another tab never shows the section of the previous one. */
  let currentHeading: { readonly documentKey?: string; readonly id?: string } = $state({});
  const currentHeadingId = $derived(currentHeading.documentKey === activeKey ? currentHeading.id : undefined);

  function showCurrentHeading(headingId: string | undefined) {
    currentHeading = {
      ...(activeKey === undefined ? {} : { documentKey: activeKey }),
      ...(headingId === undefined ? {} : { id: headingId }),
    };
  }

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

  /** Widths while a splitter is dragged; the settings keep the width once the drag ends. */
  let draggedPanelWidths: Partial<Record<ResizablePanel, number | undefined>> = $state({});

  function shownPanelWidth(panel: ResizablePanel): number {
    const dragged = draggedPanelWidths[panel];
    if (dragged !== undefined) return dragged;
    return snapshot ? panelWidthOf(snapshot.viewer.viewSettings, panel) : 0;
  }

  function finishPanelResize(panel: ResizablePanel, widthPx: number) {
    draggedPanelWidths = { ...draggedPanelWidths, [panel]: undefined };
    void controller.execute({ kind: 'resizePanel', panel, widthPx });
  }

  function lineCountOf(text: string): number {
    return text.split('\n').length;
  }

  function followEditorScroll(sync: ScrollSync, scrollRatio: number) {
    controller.rememberScrollPosition(scrollRatio);
    sync.editorScrolled();
    if (shownEditor && editedDocument)
      showCurrentHeading(headingIdAtLine(editedDocument.outline, shownEditor.topLine()));
  }

  function attachEditor(sync: ScrollSync, sourceEditor: SourceEditor | undefined) {
    shownEditor = sourceEditor;
    sync.attachEditor(sourceEditor);
  }

  /** While editing the caret moves to the heading; otherwise the shown document scrolls to it. */
  function goToHeading(entry: OutlineEntry) {
    showCurrentHeading(entry.id);
    if (editedDocument && shownEditor) {
      shownEditor.revealLine(entry.line);
      return;
    }
    headingRequest = { entry, number: (headingRequest?.number ?? 0) + 1 };
  }

  // The webview's own menu offers browser actions such as Back and Refresh that make no sense in the app.
  function preventBrowserContextMenu(event: MouseEvent) {
    event.preventDefault();
  }

  const MOUSE_BACK_BUTTON = 3;
  const MOUSE_FORWARD_BUTTON = 4;

  function handleMouseUp(event: MouseEvent) {
    const commands: Partial<Record<number, ViewerCommand>> = {
      [MOUSE_BACK_BUTTON]: { kind: 'goBack' },
      [MOUSE_FORWARD_BUTTON]: { kind: 'goForward' },
    };
    const command = commands[event.button];
    if (!command) return;
    event.preventDefault();
    void controller.execute(command);
  }

  function isRegionKey(event: KeyboardEvent): boolean {
    return event.key === 'F6' && !event.ctrlKey && !event.altKey && !event.metaKey && !event.isComposing;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented) return;
    if (isRegionKey(event)) {
      const direction = event.shiftKey ? -1 : 1;
      if (moveFocusBetweenRegions(globalThis.document, direction, globalThis.document.activeElement))
        event.preventDefault();
      return;
    }
    const command = commandForShortcut(event, platform);
    if (!command) return;
    event.preventDefault();
    void controller.execute(command);
  }
</script>

<svelte:window
  onkeydown={handleKeydown}
  onmouseup={handleMouseUp}
  oncontextmenu={preventBrowserContextMenu}
/>

{#if snapshot}
  {@const viewSettings = snapshot.viewer.viewSettings}
  <div class="app-shell">
    <div
      class="viewer"
      class:without-sidebar={!viewSettings.isSidebarVisible}
      style:--explorer-width="{shownPanelWidth('explorer')}px"
    >
      <ActivityBar
        isSidebarVisible={viewSettings.isSidebarVisible}
        sidebarView={viewSettings.sidebarView}
        {translator}
        onCommand={(command: ViewerCommand) => void controller.execute(command)}
      />
      {#if viewSettings.isSidebarVisible && viewSettings.sidebarView === 'search'}
        <FolderSearchPanel
          {translator}
          focusRequest={snapshot.folderSearchFocusRequest}
          hasFolders={controller.hasSearchableFolders()}
          onSearch={(query: string, options: TextSearchOptions) => controller.searchFolders(query, options)}
          onOpenMatch={(path: string, query: string, options: TextSearchOptions) =>
            void controller.execute({ kind: 'openSearchMatch', path, query, options })}
        />
      {:else if viewSettings.isSidebarVisible && viewSettings.sidebarView === 'outline'}
        <OutlinePanel
          outline={activeTab ? snapshot.activeDocument?.outline : undefined}
          {currentHeadingId}
          {translator}
          onSelectHeading={goToHeading}
        />
      {:else if viewSettings.isSidebarVisible}
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
      {#if viewSettings.isSidebarVisible}
        <PanelResizer
          label={translator.translate('sidebar.resize')}
          size={shownPanelWidth('explorer')}
          growDirection={1}
          minSize={MIN_PANEL_WIDTH_PX}
          maxSize={MAX_PANEL_WIDTH_PX}
          onPreview={(widthPx: number) => (draggedPanelWidths = { ...draggedPanelWidths, explorer: widthPx })}
          onResize={(widthPx: number) => finishPanelResize('explorer', widthPx)}
          onReset={() => void controller.execute({ kind: 'resetPanelWidth', panel: 'explorer' })}
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
          <button
            aria-pressed={viewSettings.isPreviewBesideEditor}
            disabled={!snapshot.activeDocument}
            onclick={() => void controller.execute({ kind: 'togglePreviewBesideEditor' })}
          >
            {translator.translate('toolbar.previewBeside')}
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
          onCommand={(command: ViewerCommand) => void controller.execute(command)}
        />
        {#if viewSettings.isBreadcrumbsVisible && activeTab && snapshot.activeDocument}
          <Breadcrumbs
            displayPath={snapshot.activeDocument.displayPath}
            fileName={snapshot.activeDocument.fileName}
            hasFolder={!snapshot.activeDocument.isUntitled}
            outline={snapshot.activeDocument.outline}
            {currentHeadingId}
            {translator}
            onRevealInExplorer={() =>
              void controller.execute({ kind: 'showSidebarView', sidebarView: 'explorer' })}
            onSelectHeading={goToHeading}
          />
        {:else}
          <div></div>
        {/if}
        <div class="reading-area" data-focus-region>
          {#if !activeTab}
            <StartPage
              recentFiles={snapshot.viewer.recentFiles.entries()}
              {translator}
              onCommand={(command: ViewerCommand) => void controller.execute(command)}
              onOpenRecentFile={(recentFile: RecentFile) => void controller.openRecentFile(recentFile)}
            />
          {:else if editedDocument}
            {#key editedDocument.canonicalKey}
              <EditingLayout
                isPreviewBeside={viewSettings.isPreviewBesideEditor}
                editorSharePercent={viewSettings.editorSharePercent}
                lineCount={lineCountOf(editedDocument.source)}
                previewContent={editedDocument.html}
                {translator}
                onShareChange={(sharePercent: number) =>
                  void controller.execute({ kind: 'setEditorShare', sharePercent })}
                onShareReset={() =>
                  void controller.execute({
                    kind: 'setEditorShare',
                    sharePercent: DEFAULT_EDITOR_SHARE_PERCENT,
                  })}
              >
                {#snippet editor(sync: ScrollSync)}
                  <SourceEditorPane
                    canonicalKey={editedDocument.canonicalKey}
                    fileName={editedDocument.fileName}
                    text={editedDocument.source}
                    zoomPercent={viewSettings.zoomPercent}
                    scrollRatio={editedDocument.scrollRatio}
                    {translator}
                    editorRequest={snapshot?.editorRequest}
                    onReady={(sourceEditor: SourceEditor | undefined) => attachEditor(sync, sourceEditor)}
                    onScroll={(scrollRatio: number) => followEditorScroll(sync, scrollRatio)}
                    onChange={(text: string) =>
                      controller.updateEditedText(editedDocument.canonicalKey, text)}
                  />
                {/snippet}
                {#snippet preview()}
                  <DocumentView
                    document={editedDocument}
                    zoomPercent={viewSettings.zoomPercent}
                    readingWidth={viewSettings.readingWidth}
                    typography={viewSettings.typography}
                    {codeHighlighter}
                    {richBlocks}
                    {translator}
                    shouldRestoreScroll={false}
                    copyAsHtmlRequest={snapshot?.copyAsHtmlRequest}
                    onOpenLink={(link: DocumentLink) => void controller.openLink(link)}
                    onCommand={(command: ViewerCommand) => void controller.execute(command)}
                    isOutlineVisible={false}
                    isFavourite={isActiveFavourite}
                    canBeFavourite={!isActiveUntitled}
                  />
                {/snippet}
              </EditingLayout>
            {/key}
          {:else}
            <DocumentView
              document={snapshot.activeDocument}
              zoomPercent={viewSettings.zoomPercent}
              readingWidth={viewSettings.readingWidth}
              typography={viewSettings.typography}
              {codeHighlighter}
              {richBlocks}
              findRequest={snapshot.findRequest}
              findQuery={snapshot.findQuery}
              copyAsHtmlRequest={snapshot.copyAsHtmlRequest}
              exportRequest={snapshot.exportRequest}
              {headingRequest}
              locale={translator.locale}
              isSourceView={snapshot.isSourceView ?? false}
              onCloseFind={() => controller.closeFind()}
              {translator}
              onOpenLink={(link: DocumentLink) => void controller.openLink(link)}
              onScroll={(scrollRatio: number) => controller.rememberScrollPosition(scrollRatio)}
              onCurrentHeadingChange={showCurrentHeading}
              onCommand={(command: ViewerCommand) => void controller.execute(command)}
              isOutlineVisible={isSidebarViewShown(viewSettings, 'outline')}
              isFavourite={isActiveFavourite}
              canBeFavourite={!isActiveUntitled}
            />
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
  {:else if snapshot.openDialog === 'settings'}
    <SettingsDialog
      settings={snapshot.viewer.viewSettings}
      dataFolder={appInfo.dataFolder}
      {translator}
      onCommand={(command: ViewerCommand) => void controller.execute(command)}
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
  {#if snapshot.openDialog === 'clearAllData'}
    <ConfirmDialog
      title={translator.translate('privacy.clearAllData.title')}
      message={translator.translate('privacy.clearAllData.message')}
      confirmLabel={translator.translate('privacy.clearAllData.confirm')}
      cancelLabel={translator.translate('privacy.clearAllData.cancel')}
      onConfirm={() => void controller.execute({ kind: 'clearAllData' })}
      onCancel={() => controller.closeDialog()}
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
    grid-template-columns: auto var(--explorer-width) auto 1fr;
    min-height: 0;
  }

  .viewer.without-sidebar {
    grid-template-columns: auto 1fr;
  }

  .workspace {
    display: grid;
    grid-template-rows: auto auto auto auto 1fr;
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
