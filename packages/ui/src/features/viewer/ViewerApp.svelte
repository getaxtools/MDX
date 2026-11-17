<script lang="ts">
  import {
    DEFAULT_EDITOR_SHARE_PERCENT,
    DEFAULT_WORKSPACE_KIND_ID,
    isSidebarViewShown,
    measureDocument,
    availableSnippets,
    MAX_PANEL_WIDTH_PX,
    MIN_PANEL_WIDTH_PX,
    panelWidthOf,
    type Favourite,
    type RecentFile,
    type ResizablePanel,
    type RingPoint,
    type WorkspaceKindId,
    notesLocationOf,
    noteNameOf,
    notesSettingsOf,
    type SpecSearchFilter,
  } from '@mdx/core';
  import type {
    FormattingState,
    FormulaEditRequest,
    FormulaKind,
    FormulaTarget,
    FormulaWriteOutcome,
    SectionAction,
    SourceEditor,
    ToolboxAction,
    WrittenLink,
  } from '@mdx/editor';
  import type { MessageKey, Translator } from '@mdx/i18n';
  import type { CodeHighlighter, OutlineEntry, RichBlockRenderer } from '@mdx/renderer';
  import { tick, untrack } from 'svelte';
  import CommandPalette from '../command-palette/CommandPalette.svelte';
  import { paletteCommands } from '../command-palette/paletteCommands';
  import ExplorerSidebar from '../explorer/ExplorerSidebar.svelte';
  import FileArcHost from '../file-arc/FileArcHost.svelte';
  import {
    fileArcDirectionOf,
    isFileArcCommand,
    isOverlayOpenIn,
    type FileArcCommand,
    type FileArcControls,
  } from '../file-arc/fileArcCommands';
  import { fileArcListOf, fileArcWordingOf } from '../file-arc/viewerFileArc';
  import { FolderTreeState } from '../folder-tree/FolderTreeState';
  import { NoteTreeMemory } from '../notes/NoteTreeMemory';
  import FolderSearchPanel from '../folder-search/FolderSearchPanel.svelte';
  import EditingLayout from '../editing/EditingLayout.svelte';
  import type { ScrollSync } from '../editing/ScrollSync';
  import SourceEditorPane from '../editing/SourceEditorPane.svelte';
  import FormattingToolbar from '../editing/FormattingToolbar.svelte';
  import EquationEditorHost from '../equation/EquationEditorHost.svelte';
  import { isRefusalOfTheSource } from '../equation/formulaProblemText';
  import type { RenderedFormula } from '../document-view/renderedFormulaAt';
  import { openLinkFromEditor } from '../editing/editorLinks';
  import { createRichTextRendering } from '../editing/richTextRendering';
  import PanelResizer from '../../components/PanelResizer.svelte';
  import SettingsDialog from '../settings/SettingsDialog.svelte';
  import StartPage from '../start-page/StartPage.svelte';
  import SpecDashboard from '../spec-viewer/SpecDashboard.svelte';
  import { shownDashboardOf } from '../spec-viewer/specDashboard';
  import SpecChangePage from '../spec-viewer/SpecChangePage.svelte';
  import { shownChangePageOf } from '../spec-viewer/specChangePage';
  import SpecPreviewPage from '../spec-viewer/SpecPreviewPage.svelte';
  import SpecFeaturePage from '../spec-viewer/SpecFeaturePage.svelte';
  import { shownFeaturePageOf } from '../spec-viewer/specFeaturePage';
  import AboutDialog from '../about/AboutDialog.svelte';
  import type { AppInfo } from '../about/AppInfo';
  import type { ThirdPartyLicensesLoader } from '../about/ThirdPartyLicenses';
  import ConfirmDialog from '../../components/ConfirmDialog.svelte';
  import type { DocumentLink } from '../document-view/DocumentLink';
  import DocumentView from '../document-view/DocumentView.svelte';
  import { propertyFieldsStateOf } from '../document-view/PropertyEditing';
  import { isUntitledLocation, type DocumentLocation, type TextSearchOptions } from '@mdx/platform';
  import KeyboardShortcutsDialog from '../help/KeyboardShortcutsDialog.svelte';
  import WordGoalDialog from '../word-goals/WordGoalDialog.svelte';
  import WorkspaceDialogs from '../workspaces/WorkspaceDialogs.svelte';
  import { isWorkspaceDialog } from '../workspaces/WorkspaceActions';
  import WorkspaceButton from '../workspaces/WorkspaceButton.svelte';
  import NotesLocationMissing from '../notes-location/NotesLocationMissing.svelte';
  import NotesMoveDialog from '../notes-location/NotesMoveDialog.svelte';
  import NoteTrashDialog from '../notes/NoteTrashDialog.svelte';
  import NoteBacklinks from '../notes/NoteBacklinks.svelte';
  import NoteFromTemplateDialog from '../notes/NoteFromTemplateDialog.svelte';
  import NoteLinkUpdatesDialog from '../notes/NoteLinkUpdatesDialog.svelte';
  import NoteImportDialog from '../notes/NoteImportDialog.svelte';
  import NoteExportDialog from '../notes/NoteExportDialog.svelte';
  import { workspaceNameOf } from '../workspaces/workspaceCommands';
  import { recentWorkspaceLinks } from '../workspaces/recentWorkspaceLinks';
  import { SessionWordCounts } from '../word-goals/SessionWordCounts';
  import PasteTableDialog from '../table-paste/PasteTableDialog.svelte';
  import OutlinePanel from '../outline/OutlinePanel.svelte';
  import PromptInjectionPanel from '../prompt-injection/PromptInjectionPanel.svelte';
  import type { HeadingRequest } from '../outline/HeadingRequest';
  import { headingIdAtLine } from '../outline/headingIdAtLine';
  import TabStripView from '../tabs/TabStripView.svelte';
  import Breadcrumbs from '../breadcrumbs/Breadcrumbs.svelte';
  import { applyTheme } from '../view/applyTheme';
  import ActivityBar from '../view/ActivityBar.svelte';
  import StatusBar from '../view/StatusBar.svelte';
  import DocumentToolbar from '../view/DocumentToolbar.svelte';
  import NoticeBar from './NoticeBar.svelte';
  import { focusRegionOf, moveFocusBetweenRegions } from './focusRegions';
  import SidebarToggleButton from '../view/SidebarToggleButton.svelte';
  import { COMMAND_SHORTCUTS, commandForShortcut, shortcutLabelFor } from '../shortcuts/commandShortcuts';
  import { effectiveCommandShortcuts } from '../shortcuts/effectiveCommandShortcuts';
  import type { ControlWheelButton } from '../view/ControlWheelButton';
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
  /** A closed wheel stays in the page while it fades out, and opening it again during the fade reuses it. */
  let isControlWheelFading = $state(false);
  $effect(() => controller.subscribe(receiveSnapshot));

  function isControlWheelShownIn(shown: ViewerSnapshot | undefined): boolean {
    return shown?.openDialog === 'controlWheel' || shown?.openDialog === 'workspaceKindSettings';
  }

  // The first snapshot arrives while the effect above runs, so reads here must not subscribe it again.
  function receiveSnapshot(latest: ViewerSnapshot) {
    untrack(() => {
      if (isControlWheelShownIn(latest)) isControlWheelFading = false;
      else if (isControlWheelShownIn(snapshot)) isControlWheelFading = true;
      snapshot = latest;
    });
  }

  $effect(() => {
    if (snapshot) applyTheme(globalThis.document.documentElement, snapshot.viewer.viewSettings.theme);
  });

  const shortcuts = $derived(
    snapshot ? effectiveCommandShortcuts(snapshot.viewer.shortcutOverrides) : COMMAND_SHORTCUTS,
  );
  const isWheelOpenedAtPointer = $derived(snapshot?.viewer.viewSettings.isWheelOpenedAtPointer ?? false);
  const isControlWheelOpen = $derived(isControlWheelShownIn(snapshot));
  const controlWheelButton: ControlWheelButton | undefined = $derived.by(() => {
    if (!snapshot?.viewer.viewSettings.isWheelButtonInStatusBar) return undefined;
    const shortcut = shortcutLabelFor({ kind: 'toggleControlWheel' }, translator, shortcuts);
    return {
      activeKindId: snapshot.viewer.workspaceKinds.activeKindId(),
      ...(shortcut ? { shortcut } : {}),
      onShowControlWheel: () => void controller.execute({ kind: 'toggleControlWheel' }),
    };
  });

  /** Read once when the wheel opens, so it is not state: the wheel must not follow the pointer. */
  const lastPointer: { position: RingPoint | undefined } = { position: undefined };

  $effect(() => {
    if (!isWheelOpenedAtPointer) return undefined;
    function rememberPointer(event: PointerEvent) {
      lastPointer.position = { x: event.clientX, y: event.clientY };
    }
    globalThis.addEventListener('pointermove', rememberPointer, { passive: true });
    return () => {
      globalThis.removeEventListener('pointermove', rememberPointer);
      lastPointer.position = undefined;
    };
  });

  /** Documents show in the Markdown viewer, in a Notes workspace whose notes folder is there and in a Spec viewer one. */
  const isReadingDocuments = $derived(
    (snapshot?.viewer.workspaceKinds.activeKindId() ?? DEFAULT_WORKSPACE_KIND_ID) ===
      DEFAULT_WORKSPACE_KIND_ID ||
      snapshot?.notes !== undefined ||
      snapshot?.specProjects !== undefined,
  );
  const activeTab = $derived(snapshot?.viewer.tabStrip.activeTab());
  const shownWorkspace = $derived(snapshot?.workspaces?.registry.find(snapshot.workspaces.shownWorkspaceId));
  const shownWorkspaceKindId = $derived(
    (shownWorkspace?.kindId ?? DEFAULT_WORKSPACE_KIND_ID) as WorkspaceKindId,
  );
  const activeKey = $derived(activeTab?.location.canonicalKey);
  const shownDashboard = $derived(shownDashboardOf(snapshot?.specProjects, activeTab?.location));
  const shownChangePage = $derived(shownChangePageOf(snapshot?.specProjects, activeTab?.location));
  const shownFeaturePage = $derived(shownFeaturePageOf(snapshot?.specProjects, activeTab?.location));
  const shownPreview = $derived(
    activeTab ? snapshot?.specPreviews?.get(activeTab.location.canonicalKey) : undefined,
  );
  let headingRequest: HeadingRequest | undefined = $state();
  let cursorCount = $state(1);
  let isCaretInLink = $state(false);
  let editorFormatting: FormattingState | undefined = $state();
  /** The formula the equation editor is open on, in the document being edited. */
  let equationEditing: { request: FormulaEditRequest; canonicalKey: string } | undefined = $state();
  let selectedWords = $state(0);
  const sessionWordCounts = new SessionWordCounts();
  const activeWordGoal = $derived(
    activeKey !== undefined && snapshot && Object.hasOwn(snapshot.viewer.wordGoals, activeKey)
      ? snapshot.viewer.wordGoals[activeKey]
      : undefined,
  );
  const wordsThisSession = $derived(
    snapshot?.activeDocument
      ? sessionWordCounts.changeSince(
          snapshot.activeDocument.canonicalKey,
          snapshot.activeDocument.statistics.words,
        )
      : 0,
  );
  let shownEditor: SourceEditor | undefined;
  /** A heading chosen while the editor was still starting, revealed once it is ready. */
  let pendingEditorLine: number | undefined;
  /** Edit Formula chosen in the preview, waiting for the editor it opened. */
  let pendingFormulaEdit: RenderedFormula | undefined;
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
  /** Shown by the setting, and in a document whose finding was just revealed. */
  const isShowingHiddenCharacters = $derived(
    (snapshot?.viewer.viewSettings.isShowingHiddenCharacters ?? false) ||
      snapshot?.isRevealingFinding === true,
  );
  const isActiveFavourite = $derived(
    activeTab ? (snapshot?.viewer.favourites.isFavourite(activeTab.location.canonicalKey) ?? false) : false,
  );

  /** Widths while a splitter is dragged; the settings keep the width once the drag ends. */
  let draggedPanelWidths: Partial<Record<ResizablePanel, number | undefined>> = $state({});

  /** Hiding from the keyboard puts the focus in the document, not on the window. */
  async function hideSidebar(isFromKeyboard: boolean) {
    await controller.execute({ kind: 'hideSidebar' });
    if (!isFromKeyboard) return;
    await tick();
    focusDocument();
  }

  function focusDocument() {
    focusRegionOf(globalThis.document.querySelector('.reading-area'));
  }

  /** Kept here rather than in the tree, so the arc lists the tree as it was while the side bar is hidden. */
  const sideBarTrees = { folders: new FolderTreeState(), notes: new NoteTreeMemory() };
  let fileArcControls: FileArcControls | undefined;
  const fileArcWording = $derived(snapshot ? fileArcWordingOf(snapshot) : undefined);

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
    if (sourceEditor && pendingEditorLine !== undefined) sourceEditor.revealLine(pendingEditorLine);
    pendingEditorLine = undefined;
    if (sourceEditor && pendingFormulaEdit)
      sourceEditor.editFormulaInOrder(pendingFormulaEdit.index, pendingFormulaEdit.source);
    pendingFormulaEdit = undefined;
  }

  /** Edit Formula in the preview opens the document for editing, then the equation editor on that formula. */
  function editPreviewFormula(formula: RenderedFormula) {
    if (shownEditor && editedDocument) {
      shownEditor.editFormulaInOrder(formula.index, formula.source);
      return;
    }
    pendingFormulaEdit = formula;
    void controller.execute({ kind: 'toggleEditing' });
  }

  /** The equation editor stays open on a source the editor refused, so the user can correct it. */
  function insertFormula(
    target: FormulaTarget,
    formula: { readonly tex: string; readonly kind: FormulaKind },
  ): FormulaWriteOutcome {
    const outcome = shownEditor?.insertFormula(target, formula) ?? 'textChanged';
    if (!isRefusalOfTheSource(outcome)) equationEditing = undefined;
    return outcome;
  }

  function cancelEquation() {
    equationEditing = undefined;
    shownEditor?.focus();
  }

  /** While editing the caret moves to the heading; otherwise the shown document scrolls to it. */
  function goToHeading(entry: OutlineEntry) {
    showCurrentHeading(entry.id);
    if (editedDocument) {
      if (shownEditor) shownEditor.revealLine(entry.line);
      else pendingEditorLine = entry.line;
      return;
    }
    headingRequest = { entry, number: (headingRequest?.number ?? 0) + 1 };
  }

  function openEditorLink(link: WrittenLink) {
    openLinkFromEditor(link, editedDocument?.outline ?? [], {
      openLink: (link) => void controller.openLink(link),
      goToHeading,
    });
  }

  // The webview's own menu offers browser actions such as Back and Refresh that make no sense in the app.
  function preventBrowserContextMenu(event: MouseEvent) {
    event.preventDefault();
  }

  type ControlWheelComponent = typeof import('../control-wheel/ControlWheel.svelte').default;
  let controlWheelComponent: Promise<ControlWheelComponent> | undefined;

  function loadControlWheel(): Promise<ControlWheelComponent> {
    controlWheelComponent ??= import('../control-wheel/ControlWheel.svelte').then((module) => module.default);
    return controlWheelComponent;
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
    const command = commandForShortcut(event, platform, shortcuts);
    if (!command) return;
    if (isFileArcCommand(command)) {
      stepFileArc(event, command);
      return;
    }
    event.preventDefault();
    void controller.execute(command);
  }

  /** The arc keys do nothing while a dialog, a menu, the palette or the control wheel is open. */
  function stepFileArc(event: KeyboardEvent, command: FileArcCommand) {
    if (snapshot?.openDialog !== undefined || isOverlayOpenIn(globalThis.document)) return;
    if (fileArcControls?.step(fileArcDirectionOf(command))) event.preventDefault();
  }
</script>

{#snippet backlinksFooter()}
  {#if snapshot?.noteBacklinks && snapshot.activeDocument}
    <NoteBacklinks
      backlinks={snapshot.noteBacklinks.backlinks}
      noteName={noteNameOf(snapshot.activeDocument.fileName)}
      {translator}
      onCommand={(command: ViewerCommand) => void controller.execute(command)}
    />
  {/if}
{/snippet}

<svelte:window
  onkeydown={handleKeydown}
  onmouseup={handleMouseUp}
  oncontextmenu={preventBrowserContextMenu}
  onfocus={() => void controller.windowFocused()}
/>

{#if snapshot}
  {@const viewSettings = snapshot.viewer.viewSettings}
  {@const listedSnapshot = snapshot}
  <div class="app-shell">
    <div
      class="viewer"
      class:without-sidebar={!viewSettings.isSidebarVisible}
      style:--explorer-width="{shownPanelWidth('explorer')}px"
    >
      <ActivityBar
        isSidebarVisible={viewSettings.isSidebarVisible}
        sidebarView={viewSettings.sidebarView}
        kinds={snapshot.viewer.workspaceKinds}
        kindSwitcher={viewSettings.kindSwitcher}
        {translator}
        onCommand={(command: ViewerCommand) => void controller.execute(command)}
      />
      {#if viewSettings.isSidebarVisible}
        <div class="sidebar-column">
          {#if shownWorkspace}
            <WorkspaceButton
              name={workspaceNameOf(shownWorkspace, translator)}
              kindId={shownWorkspaceKindId}
              icon={shownWorkspace.icon}
              colour={shownWorkspace.colour}
              shortcutLabel={shortcutLabelFor({ kind: 'showWorkspaceSwitcher' }, translator, shortcuts)}
              {translator}
              onSwitch={() => void controller.execute({ kind: 'showWorkspaceSwitcher' })}
            >
              {#snippet actions()}
                <SidebarToggleButton
                  action="hide"
                  {translator}
                  onToggle={(isFromKeyboard: boolean) => void hideSidebar(isFromKeyboard)}
                />
              {/snippet}
            </WorkspaceButton>
          {:else}
            <div class="sidebar-header">
              <SidebarToggleButton
                action="hide"
                {translator}
                onToggle={(isFromKeyboard: boolean) => void hideSidebar(isFromKeyboard)}
              />
            </div>
          {/if}
          {#if viewSettings.sidebarView === 'search'}
            <FolderSearchPanel
              {translator}
              focusRequest={snapshot.folderSearchFocusRequest}
              hasFolders={controller.hasSearchableFolders()}
              onSearch={(query: string, options: TextSearchOptions, specFilter?: SpecSearchFilter) =>
                controller.searchFolders(query, options, specFilter)}
              onOpenMatch={(path: string, query: string, options: TextSearchOptions) =>
                void controller.execute({ kind: 'openSearchMatch', path, query, options })}
              isNotesSearch={snapshot.notes !== undefined}
              isSpecSearch={snapshot.specProjects !== undefined}
              requestedQuery={snapshot.folderSearchQuery}
              notesIndexStatus={snapshot.notes?.indexStatus}
            />
          {:else if viewSettings.sidebarView === 'promptInjection'}
            <PromptInjectionPanel
              hasDocument={activeTab !== undefined && snapshot.activeDocument !== undefined}
              check={snapshot.injectionCheck}
              isShowingHiddenCharacters={viewSettings.isShowingHiddenCharacters}
              {translator}
              onCommand={(command: ViewerCommand) => void controller.execute(command)}
            />
          {:else if viewSettings.sidebarView === 'outline'}
            <OutlinePanel
              outline={activeTab ? snapshot.activeDocument?.outline : undefined}
              {currentHeadingId}
              {translator}
              onSelectHeading={goToHeading}
              onChangeSection={(entry: OutlineEntry, action: SectionAction) =>
                void controller.execute({ kind: 'changeOutlineSection', line: entry.line, action })}
            />
          {:else}
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
              notes={snapshot.notes}
              specProjects={snapshot.specProjects}
              isNoteDeletionConfirmed={viewSettings.isNoteDeletionConfirmed}
              onNotesCommand={(command: ViewerCommand) => controller.execute(command)}
              onListNoteFolder={(folderPath: string) => controller.listNoteFolder(folderPath)}
              folderRevisions={snapshot.folderRevisions}
              onShowFolder={(folderPath: string) => controller.showFolder(folderPath)}
              onOpenDocument={(documentPath: string) => void controller.openDocuments([documentPath])}
              {translator}
              onOpenFavourite={(favourite: Favourite) => void controller.openFavourite(favourite)}
              onOpenRecentFile={(recentFile: RecentFile) => void controller.openRecentFile(recentFile)}
              folderTreeState={sideBarTrees.folders}
              noteTreeMemory={sideBarTrees.notes}
            />
          {/if}
        </div>
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
        <TabStripView
          tabs={snapshot.viewer.tabStrip.tabs()}
          activeKey={activeTab?.location.canonicalKey}
          pathStatuses={snapshot.pathStatuses}
          unsavedKeys={snapshot.unsavedDocumentKeys}
          {translator}
          onActivate={(canonicalKey: string) => controller.activateTab(canonicalKey)}
          onCommand={(command: ViewerCommand) => void controller.execute(command)}
          onShowSidebar={viewSettings.isSidebarVisible
            ? undefined
            : () => void controller.execute({ kind: 'showSidebar' })}
        />
        <div class="document-header">
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
          {/if}
          <DocumentToolbar
            {viewSettings}
            hasDocument={snapshot.activeDocument !== undefined}
            canBeFavourite={activeTab !== undefined && !isActiveUntitled}
            isFavourite={isActiveFavourite}
            isEditing={snapshot.isActiveDocumentEditing ?? false}
            {translator}
            onCommand={(command: ViewerCommand) => void controller.execute(command)}
          />
          {#if editedDocument}
            <FormattingToolbar
              formatting={editorFormatting}
              editingMode={snapshot.editingMode ?? 'source'}
              {translator}
              onRun={(action: ToolboxAction) => shownEditor?.runFormatting(action)}
              onToggleEditingMode={() => void controller.execute({ kind: 'toggleEditingMode' })}
              onReturnToEditor={() => shownEditor?.focus()}
            />
          {/if}
        </div>
        <span class="mode-announcement" role="status">
          {#key snapshot.editingModeAnnouncement?.number}
            {snapshot.editingModeAnnouncement
              ? translator.translate('editing.modeAnnouncement', {
                  mode: snapshot.editingModeAnnouncement.mode,
                })
              : ''}
          {/key}
        </span>
        <NoticeBar
          message={snapshot.notice}
          actions={snapshot.noticeActions}
          {translator}
          onAction={(action: NoticeAction) => void controller.runNoticeAction(action)}
          onDismiss={() => controller.dismissNotice()}
        />
        <div class="reading-area" data-focus-region>
          {#if snapshot.missingNotesLocation !== undefined}
            <NotesLocationMissing
              path={snapshot.missingNotesLocation}
              {translator}
              onCommand={(command: ViewerCommand) => void controller.execute(command)}
            />
          {:else if !activeTab || !isReadingDocuments}
            <StartPage
              recentFiles={snapshot.viewer.recentFiles.entries()}
              activeKindId={snapshot.viewer.workspaceKinds.activeKindId()}
              notesWorkspaceName={snapshot.notes && shownWorkspace
                ? workspaceNameOf(shownWorkspace, translator)
                : undefined}
              recentWorkspaces={snapshot.workspaces
                ? recentWorkspaceLinks(snapshot.workspaces, snapshot.viewer.workspaceKinds, translator)
                : []}
              canCreateWorkspace={snapshot.workspaces?.registry.lastShownOfKind(
                snapshot.viewer.workspaceKinds.activeKindId(),
              ) === undefined && snapshot.workspaces !== undefined}
              {translator}
              onCommand={(command: ViewerCommand) => void controller.execute(command)}
              onOpenRecentFile={(recentFile: RecentFile) => void controller.openRecentFile(recentFile)}
            />
          {:else if shownDashboard}
            <SpecDashboard
              dashboard={shownDashboard}
              {translator}
              onOpenChange={(changeFolder: string) =>
                void controller.execute({
                  kind: 'openSpecChange',
                  rootKey: shownDashboard.scanned.root.canonicalKey,
                  changeFolder,
                })}
              onOpenFeature={(featureFolder: string) =>
                void controller.execute({
                  kind: 'openSpecFeature',
                  rootKey: shownDashboard.scanned.root.canonicalKey,
                  featureFolder,
                })}
            />
          {:else if shownChangePage}
            <SpecChangePage
              page={shownChangePage}
              {translator}
              onOpenDocument={(documentPath: string) => void controller.openDocuments([documentPath])}
              onOpenFinding={(documentPath: string, line: number | undefined) =>
                void controller.execute({ kind: 'openSpecFinding', documentPath, line })}
              onOpenPreview={(capability: string) =>
                void controller.execute({
                  kind: 'openSpecPreview',
                  rootKey: shownChangePage.scanned.root.canonicalKey,
                  changeFolder: shownChangePage.change.folder,
                  capability,
                })}
            />
          {:else if shownFeaturePage}
            <SpecFeaturePage
              page={shownFeaturePage}
              {translator}
              onOpenDocument={(documentPath: string) => void controller.openDocuments([documentPath])}
              onOpenFinding={(documentPath: string, line: number | undefined) =>
                void controller.execute({ kind: 'openSpecFinding', documentPath, line })}
            />
          {:else if shownPreview}
            <SpecPreviewPage preview={shownPreview} {translator} />
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
                    typography={viewSettings.typography}
                    richTextRendering={createRichTextRendering({
                      documentKey: editedDocument.canonicalKey,
                      renderMarkdown: (markdown: string) =>
                        controller.renderDocumentBlock(editedDocument.canonicalKey, markdown),
                      richBlocks,
                      translator,
                    })}
                    scrollRatio={editedDocument.scrollRatio}
                    {translator}
                    editorRequest={snapshot?.editorRequest}
                    editingMode={snapshot?.editingMode ?? 'source'}
                    slashMenu={{
                      isInRichText: viewSettings.isSlashMenuInRichText,
                      isInSource: viewSettings.isSlashMenuInSource,
                    }}
                    {isShowingHiddenCharacters}
                    markedRanges={snapshot?.injectionCheck?.findingRanges ?? []}
                    onPastePicture={(bytes: Uint8Array) => controller.pastePicture(bytes)}
                    onCursorCountChange={(count: number) => (cursorCount = count)}
                    onOpenLink={openEditorLink}
                    onCaretInLinkChange={(isInLink: boolean) => (isCaretInLink = isInLink)}
                    onFormattingChange={(formatting: FormattingState) => (editorFormatting = formatting)}
                    onEditFormula={(request: FormulaEditRequest) =>
                      (equationEditing = { request, canonicalKey: editedDocument.canonicalKey })}
                    onChoosePictures={() => void controller.addPictureFiles()}
                    snippets={snapshot ? availableSnippets(snapshot.viewer.snippetLibrary) : []}
                    wikiLinks={activeTab ? controller.wikiLinkSuggesterFor(activeTab.location) : undefined}
                    isReadOnly={snapshot?.isActiveDocumentReadOnly ?? false}
                    onSelectedTextChange={(selectedText: string) =>
                      (selectedWords = selectedText === '' ? 0 : measureDocument(selectedText).words)}
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
                    {isShowingHiddenCharacters}
                    copyAsHtmlRequest={snapshot?.copyAsHtmlRequest}
                    onOpenLink={(link: DocumentLink) => void controller.openLink(link)}
                    onCommand={(command: ViewerCommand) => void controller.execute(command)}
                    onEditFormula={editPreviewFormula}
                    onMoveWithWheel={(event: WheelEvent) => fileArcControls?.moveWithWheel(event) ?? false}
                    isOutlineVisible={false}
                    isFavourite={isActiveFavourite}
                    canBeFavourite={!isActiveUntitled}
                    propertyFieldsState={snapshot
                      ? propertyFieldsStateOf(
                          editedDocument.canonicalKey,
                          snapshot.unsavedDocumentKeys,
                          snapshot.propertySavingKey,
                        )
                      : 'editable'}
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
              printRequest={snapshot.printRequest}
              onPrint={() => controller.printShownDocument()}
              {headingRequest}
              linkedHeadingRequest={snapshot.linkedHeadingRequest}
              sourceRangeRequest={snapshot.sourceRangeRequest}
              {isShowingHiddenCharacters}
              footer={snapshot.noteBacklinks ? backlinksFooter : undefined}
              locale={translator.locale}
              isSourceView={snapshot.isSourceView ?? false}
              onCloseFind={() => controller.closeFind()}
              {translator}
              onOpenLink={(link: DocumentLink) => void controller.openLink(link)}
              onScroll={(scrollRatio: number) => controller.rememberScrollPosition(scrollRatio)}
              onCurrentHeadingChange={showCurrentHeading}
              onCommand={(command: ViewerCommand) => void controller.execute(command)}
              onEditFormula={editPreviewFormula}
              onMoveWithWheel={(event: WheelEvent) => fileArcControls?.moveWithWheel(event) ?? false}
              isOutlineVisible={isSidebarViewShown(viewSettings, 'outline')}
              isFavourite={isActiveFavourite}
              canBeFavourite={!isActiveUntitled}
              propertyFieldsState={propertyFieldsStateOf(
                activeTab.location.canonicalKey,
                snapshot.unsavedDocumentKeys,
                snapshot.propertySavingKey,
              )}
            />
          {/if}
          <FileArcHost
            onControls={(controls: FileArcControls) => (fileArcControls = controls)}
            wording={fileArcWording}
            kindId={shownWorkspaceKindId}
            ctrlWheelAction={viewSettings.ctrlWheelAction}
            list={() => fileArcListOf(listedSnapshot, sideBarTrees)}
            {translator}
            onOpen={(location: DocumentLocation) => controller.openDocuments([location.displayPath])}
            onNotice={(key: MessageKey) => controller.showNotice(key)}
            onFocusDocument={focusDocument}
            readModifiedTime={(path: string) => controller.readModifiedTime(path)}
          />
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
        {controlWheelButton}
        cursorCount={editedDocument ? cursorCount : 1}
        wordGoal={activeWordGoal}
        {wordsThisSession}
        selectedWords={editedDocument ? selectedWords : 0}
        statusMessage={snapshot.notesMoveStatus}
        onShowWordGoal={() => void controller.execute({ kind: 'showWordGoal' })}
        injectionCheck={snapshot.injectionCheck}
        onShowInjectionCheck={() =>
          void controller.execute({ kind: 'showSidebarView', sidebarView: 'promptInjection' })}
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
  <EquationEditorHost
    request={equationEditing && equationEditing.canonicalKey === editedDocument?.canonicalKey
      ? equationEditing.request
      : undefined}
    {translator}
    previewFormula={(tex: string, isDisplay: boolean) =>
      richBlocks?.previewFormula(tex, isDisplay) ?? Promise.resolve({ kind: 'unavailable' })}
    onInsert={insertFormula}
    onCancel={cancelEquation}
  />
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
  {#if snapshot.outsideLinkRequest !== undefined}
    <ConfirmDialog
      title={translator.translate('specViewer.outsideLink.title')}
      message={translator.translate('specViewer.outsideLink.body', {
        path: snapshot.outsideLinkRequest.targetPath,
      })}
      confirmLabel={translator.translate('specViewer.outsideLink.open')}
      cancelLabel={translator.translate('specViewer.outsideLink.cancel')}
      onConfirm={() => void controller.answerOutsideLink(true)}
      onCancel={() => void controller.answerOutsideLink(false)}
    />
  {/if}
  {#if snapshot.openDialog === 'about'}
    <AboutDialog {appInfo} {translator} {loadThirdPartyLicenses} onClose={() => controller.closeDialog()} />
  {:else if snapshot.openDialog === 'wordGoal'}
    <WordGoalDialog
      currentGoal={activeWordGoal}
      {translator}
      onCommand={(command: ViewerCommand) => void controller.execute(command)}
      onClose={() => controller.closeDialog()}
    />
  {:else if isWorkspaceDialog(snapshot.openDialog) && snapshot.workspaces}
    <WorkspaceDialogs
      dialog={snapshot.openDialog}
      workspaces={snapshot.workspaces}
      kinds={snapshot.viewer.workspaceKinds}
      {translator}
      onCommand={(command: ViewerCommand) => void controller.execute(command)}
      onClose={() => controller.closeDialog()}
      onPickFolder={() => controller.pickNotesFolder()}
      onInspectNotesFolder={(path: string) => controller.inspectNotesFolder(path)}
    />
  {:else if snapshot.openDialog === 'noteTrash' && snapshot.notes?.trash}
    <NoteTrashDialog
      entries={snapshot.notes.trash}
      {translator}
      onCommand={(command: ViewerCommand) => void controller.execute(command)}
      onClose={() => controller.closeDialog()}
    />
  {:else if snapshot.openDialog === 'noteFromTemplate' && snapshot.notes?.templates}
    <NoteFromTemplateDialog
      templates={snapshot.notes.templates}
      templatesFolder={notesSettingsOf(shownWorkspace).templatesFolder}
      {translator}
      onCommand={(command: ViewerCommand) => void controller.execute(command)}
      onClose={() => controller.closeDialog()}
    />
  {:else if snapshot.openDialog === 'noteLinkUpdates' && snapshot.notes?.linkUpdates}
    <NoteLinkUpdatesDialog
      preview={snapshot.notes.linkUpdates}
      {translator}
      onCommand={(command: ViewerCommand) => void controller.execute(command)}
      onClose={() => void controller.execute({ kind: 'skipNoteLinkUpdates' })}
    />
  {:else if snapshot.openDialog === 'noteImport' && snapshot.notes?.noteImport}
    <NoteImportDialog
      view={snapshot.notes.noteImport}
      {translator}
      onCommand={(command: ViewerCommand) => void controller.execute(command)}
    />
  {:else if snapshot.openDialog === 'noteExport' && snapshot.notes?.noteExport}
    <NoteExportDialog
      view={snapshot.notes.noteExport}
      {translator}
      onCommand={(command: ViewerCommand) => void controller.execute(command)}
    />
  {:else if snapshot.openDialog === 'keyboardShortcuts'}
    <KeyboardShortcutsDialog
      {translator}
      {shortcuts}
      ctrlWheelAction={viewSettings.ctrlWheelAction}
      onClose={() => controller.closeDialog()}
    />
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
      {shortcuts}
      {platform}
      snippetLibrary={snapshot.viewer.snippetLibrary}
      {translator}
      onCommand={(command: ViewerCommand) => void controller.execute(command)}
      onClose={() => controller.closeDialog()}
      notesFolder={shownWorkspace ? notesLocationOf(shownWorkspace)?.path : undefined}
      notesSettings={shownWorkspace ? notesSettingsOf(shownWorkspace) : undefined}
      workspace={shownWorkspace
        ? {
            name: workspaceNameOf(shownWorkspace, translator),
            overrides: snapshot.viewer.workspaceOverrides ?? {},
          }
        : undefined}
    />
  {:else if snapshot.openDialog === 'commandPalette'}
    <CommandPalette
      {translator}
      commands={paletteCommands(translator, {
        shortcuts,
        workspaceKinds: snapshot.viewer.workspaceKinds,
        snippets: availableSnippets(snapshot.viewer.snippetLibrary),
        isNotesWorkspace: snapshot.notes !== undefined,
        isCaretInLink: editedDocument ? isCaretInLink : false,
        hasDocument: snapshot.activeDocument !== undefined,
        ...(snapshot.workspaces ? { workspaces: snapshot.workspaces } : {}),
      })}
      loadDocuments={() => controller.quickOpenDocuments()}
      onRunCommand={(command: ViewerCommand) => void controller.execute(command)}
      onOpenDocument={(documentPath: string) => void controller.openDocuments([documentPath])}
      onClose={() => controller.closeDialog()}
    />
  {/if}
  {#if isControlWheelOpen || isControlWheelFading}
    {#await loadControlWheel() then ControlWheel}
      <ControlWheel
        kinds={snapshot.viewer.workspaceKinds}
        dock={snapshot.viewer.viewSettings.wheelDock}
        pointer={lastPointer.position}
        shouldShowKindSettings={snapshot.openDialog === 'workspaceKindSettings'}
        isClosing={!isControlWheelOpen}
        {translator}
        onCommand={(command: ViewerCommand) => void controller.execute(command)}
        onClose={() => controller.closeDialog()}
        onClosed={() => (isControlWheelFading = false)}
      />
    {/await}
  {/if}
  {#if snapshot.notesMoveDialog}
    <NotesMoveDialog
      dialog={snapshot.notesMoveDialog}
      {translator}
      onCommand={(command: ViewerCommand) => void controller.execute(command)}
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
  /* Heard by screen readers, not shown: the editor itself shows the mode. */
  .mode-announcement {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

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

  .sidebar-header {
    display: flex;
    justify-content: flex-end;
    padding: var(--space-1) var(--space-2);
    border-block-end: 1px solid var(--color-border);
    border-inline-end: 1px solid var(--color-border);
    background: var(--color-surface);
  }

  .sidebar-column {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  .sidebar-column > :global(:last-child) {
    flex: 1;
    min-height: 0;
  }

  .viewer.without-sidebar {
    grid-template-columns: auto 1fr;
  }

  .workspace {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  .document-header {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-2);
    align-items: center;
    justify-content: flex-end;
    min-height: 40px;
    padding: var(--space-1) var(--space-2) var(--space-1) var(--space-3);
    border-bottom: 1px solid var(--color-border);
  }

  .reading-area {
    position: relative;
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .reading-area > :global(main) {
    flex: 1;
    min-width: 0;
  }
</style>
