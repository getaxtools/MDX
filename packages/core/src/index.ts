export {
  displayNameOf,
  FavouritesList,
  nextFavouriteGroupId,
  type Favourite,
  type FavouriteGroup,
  type FavouriteKind,
} from './favourites/FavouritesList';
export { parseFavouritesFile, toFavouritesFile } from './favourites/favouritesFile';
export { ExplorerFolders, MAX_EXPLORER_FOLDERS } from './explorer/ExplorerFolders';
export { MAX_RECENT_FILES, RecentFilesList, type RecentFile } from './recent-files/RecentFilesList';
export {
  APP_STATE_SCHEMA_VERSION,
  restoreAppState,
  savedLanguagePreference,
  toPersistedAppState,
  type NewerSavedState,
  type PersistedAppState,
  type RestoredAppState,
  type ViewerState,
} from './session/persistedAppState';
export {
  ViewerSession,
  type RestoreOutcome,
  type ViewerSessionDependencies,
  type InitialWorkspaceLists,
  type WorkspaceRequest,
} from './session/ViewerSession';
export {
  MAX_SHORTCUT_PART_LENGTH,
  MAX_SHORTCUT_PARTS,
  parseShortcutOverrides,
  type ShortcutOverrides,
} from './shortcuts/parseShortcutOverrides';
export {
  DEFAULT_WORKSPACE_KIND_ID,
  isBuiltKind,
  WORKSPACE_KINDS,
  workspaceKindsFor,
  attachmentFolderFor,
  DEFAULT_ATTACHMENT_FOLDER,
  type WorkspaceKind,
  type WorkspaceKindAvailability,
  type WorkspaceKindId,
} from './workspace-kinds/workspaceKinds';
export {
  WorkspaceKindsState,
  type KindToggleOutcome,
  type KindToggleResult,
  type SavedWorkspaceKinds,
} from './workspace-kinds/WorkspaceKindsState';
export {
  hitTestRing,
  ringLayout,
  rimArcPath,
  sectorPath,
  sectorPointAt,
  type RimShape,
  type RingDirection,
  type RingHit,
  type RingLayout,
  type RingPoint,
  type RingRadii,
  type RingSector,
  type SectorShape,
} from './workspace-kinds/ringGeometry';
export {
  LAST_TAB_NUMBER_KEY,
  MAX_REOPENABLE_TABS,
  TabStrip,
  type Tab,
  type TabStripSnapshot,
} from './tabs/TabStrip';
export {
  DEFAULT_EDITOR_SHARE_PERCENT,
  DEFAULT_VIEW_SETTINGS,
  EXPLORER_SECTIONS,
  KIND_SWITCHERS,
  MAX_EDITOR_SHARE_PERCENT,
  MAX_PANEL_WIDTH_PX,
  MIN_EDITOR_SHARE_PERCENT,
  MIN_EXPLORER_SECTION_HEIGHT_PX,
  MIN_PANEL_WIDTH_PX,
  READING_WIDTHS,
  THEME_COLOR_SCHEMES,
  THEME_PREFERENCES,
  TYPOGRAPHIES,
  EDITING_MODES,
  ZOOM_LEVELS_PERCENT,
  WHEEL_DOCKS,
  panelWidthOf,
  parseViewSettings,
  resetPanelWidth,
  resetZoom,
  resizeExplorerSection,
  resizePanel,
  setEditorShare,
  setZoom,
  showExplorerSection,
  isSidebarViewShown,
  showSidebarView,
  toggleSidebarView,
  toggleExplorerSection,
  zoomIn,
  zoomOut,
  AUTOMATIC_INJECTION_CHECKS,
  type AutomaticInjectionCheck,
  type ColorScheme,
  type ExplorerSection,
  type KindSwitcher,
  type LanguagePreference,
  type ReadingWidth,
  type ResizablePanel,
  type SidebarView,
  type ThemePreference,
  type Typography,
  type EditingModeSetting,
  type ViewSettings,
  type WheelDock,
} from './view/ViewSettings';
export {
  measureDocument,
  READING_WORDS_PER_MINUTE,
  type DocumentStatistics,
} from './documents/documentStatistics';
export { withDocumentLineBreaks, withUnixLineBreaks } from './documents/lineEndings';
export { parseSpreadsheetCells } from './tables/parseSpreadsheetCells';
export { toMarkdownTable, type MarkdownTableOptions } from './tables/toMarkdownTable';
export { fuzzyMatch, rankByFuzzyMatch, type FuzzyMatch } from './search/fuzzyMatch';
export {
  MAX_NAVIGATION_ENTRIES,
  NavigationHistory,
  type NavigationStep,
} from './navigation/NavigationHistory';
export {
  altTextOf,
  attachmentLinkTarget,
  imageMarkdown,
  pastedImageName,
} from './attachments/attachmentLinks';
export {
  clearWordGoal,
  isValidWordGoal,
  MAX_WORD_GOAL,
  parseWordGoals,
  renameWordGoal,
  setWordGoal,
  wordGoalProgress,
  type WordGoalProgress,
  type WordGoals,
} from './word-goals/wordGoals';
export {
  availableSnippets,
  BUILT_IN_SNIPPETS,
  deleteSnippet,
  EMPTY_SNIPPET_LIBRARY,
  isBuiltInSnippetId,
  MAX_SNIPPET_BODY_CHARACTERS,
  MAX_SNIPPET_NAME_CHARACTERS,
  parseSnippetLibrary,
  saveSnippet,
  setBuiltInSnippetHidden,
  snippetRefusal,
  type Snippet,
  type SnippetLibrary,
  type SnippetRefusal,
} from './snippets/snippetLibrary';
export {
  expandSnippet,
  expandTemplate,
  type ExpandedSnippet,
  type SnippetContext,
} from './snippets/expandSnippet';
export { formatDate } from './dates/formatDate';
export {
  noteAddress,
  wikiLinkTargetFor,
  parseWikiLink,
  resolveWikiLink,
  type NoteEntry,
  type WikiLink,
} from './notes/wikiLinks';
export { noteNameOf, noteTreeNodes, type NoteTreeNode } from './notes/noteTree';
export { tagTree, type TagNode } from './notes/tagTree';
export {
  DEFAULT_NOTES_SETTINGS,
  MAX_EXCLUDED_PATHS,
  dailyNoteName,
  excludedPathsFromLines,
  isValidFolderSetting,
  isValidNameFormat,
  kindDataWithNotesSettings,
  notesSettingsOf,
  type NotesSettings,
} from './notes/notesSettings';
export { isNoteOrChildAmong, locationAfterNoteMove, type MovedNote } from './notes/noteMoves';
export {
  editFrontMatter,
  type FrontMatterEdit,
  type FrontMatterEditResult,
} from './front-matter/editFrontMatter';
export { readEditableFrontMatter, type EditableProperty } from './front-matter/readEditableFrontMatter';
export {
  MAX_WORKSPACE_NAME_LENGTH,
  WORKSPACE_COLOURS,
  WORKSPACE_ICONS,
  WorkspaceRegistry,
  type NewWorkspace,
  type WorkspaceChange,
  type WorkspaceColour,
  type WorkspaceIcon,
  type WorkspaceNameProblem,
  type WorkspaceRemoval,
  type WorkspaceVisibility,
} from './workspaces/WorkspaceRegistry';
export { DEFAULT_WORKSPACE_ID } from './workspaces/storedViewerState';
export {
  WORKSPACE_OVERRIDE_FIELDS,
  type WorkspaceOverrideField,
  type WorkspaceOverrides,
} from './view/viewSettingsScopes';
export {
  MAX_WORKSPACE_FILE_BYTES,
  WORKSPACE_FILE_EXTENSION,
  readWorkspaceFile,
  writeWorkspaceFile,
  type PortableWorkspace,
  type WorkspaceFileReading,
  type WorkspaceFileRefusal,
} from './workspaces/workspaceFile';
export { notesWorkspaceFileLists } from './workspaces/notesWorkspaceFileLists';
export {
  DEFAULT_NOTES_FOLDER_NAME,
  NOTES_KIND_ID,
  claimedNotesLocations,
  defaultNotesLocationPath,
  isInsideFolder,
  kindDataWithLocation,
  isSyncedFolder,
  notePathInLocation,
  locationClaimProblem,
  notesKindData,
  notesLocationOf,
  type LocationClaimProblem,
  type NotesLocation,
} from './notes-location/notesLocation';
export {
  detectSpecProjects,
  type ChangeBasedLayout,
  type DecisionRecordFile,
  type DecisionRecordsLayout,
  type DetectedSpecProject,
  type FeatureFolder,
  type FeatureNumberedLayout,
  type FeatureSpecFolder,
  type RequirementsDesignTasksLayout,
  type SpecLayout,
  type SpecLayoutKind,
} from './spec-projects/detection/detectSpecProjects';
export {
  countTaskProgress,
  readTasks,
  type TaskItem,
  type TaskProgress,
} from './spec-projects/tasks/countTaskProgress';
export {
  AGENT_INSTRUCTION_LOCATIONS,
  isAgentInstructionFile,
} from './spec-projects/agent-files/agentInstructionLocations';
export {
  checkChange,
  deltaSpecFilesOf,
  type ChangeCheckInput,
  type DeltaSpecFile,
} from './spec-projects/change-based/checkChange';
export { checkMainSpec } from './spec-projects/change-based/checkMainSpec';
export {
  parseDeltaSpec,
  type DeltaOperation,
  type DeltaSection,
  type DeltaSpec,
  type NamedLine,
  type OrphanedRequirement,
  type RequirementRename,
  type UnpairedRename,
} from './spec-projects/change-based/parseDeltaSpec';
export { parseMainSpec, type MainSpec, type SpecPurpose } from './spec-projects/change-based/parseMainSpec';
export {
  CHANGE_METADATA_FILE,
  readChangeMetadata,
  type ChangeMetadata,
  type ChangeMetadataProblem,
} from './spec-projects/change-based/readChangeMetadata';
export {
  requirementTextOf,
  scenariosOf,
  type RequirementBlock,
  type ScenarioBlock,
} from './spec-projects/change-based/requirementBlocks';
export {
  failsCheck,
  RULE_SEVERITIES,
  type FindingSeverity,
  type StructuralFinding,
  type StructuralRule,
} from './spec-projects/change-based/structuralFindings';
export {
  applyDelta,
  type ChangedRequirement,
  type DeltaApplication,
  type DeltaApplicationInput,
  type SkippedOperation,
  type SpecAfterChange,
} from './spec-projects/change-based/applyDelta';
export { type DeltaRefusal, type DeltaRefusalReason } from './spec-projects/change-based/deltaRefusals';
export {
  activeTaskDocumentsOf,
  changeStatusOf,
  specProjectsOverview,
  type ChangeStatus,
  type ChangeDocuments,
  type ChangeSummary,
  type ProjectDocument,
  type SpecProjectSummary,
} from './spec-projects/overview/specProjectsOverview';
export {
  EMPTY_DOCUMENT_STRUCTURE,
  type DocumentSegment,
  type DocumentStructure,
  type SourceRange,
} from './prompt-injection/DocumentStructure';
export {
  type CheckTrigger,
  type DocumentOrigin,
  type FindingMessageArguments,
  type InjectionCheckRequest,
  type InjectionCheckResult,
  type InjectionFinding,
} from './prompt-injection/InjectionCheck';
export {
  SEVERITIES_FROM_HIGHEST,
  highestSeverityOf,
  isAtLeast,
  type InjectionSeverity,
} from './prompt-injection/injectionSeverity';
export { HiddenCharacterNames, type HiddenCharacterName } from './prompt-injection/HiddenCharacterNames';
export { bundledRulesetWithLists, Ruleset, type InjectionRule } from './prompt-injection/Ruleset';
export { MAX_EXCERPT_LENGTH, safeDisplayText } from './prompt-injection/safeExcerpt';
export {
  MAX_LISTED_FINDINGS,
  runCharacterCheck,
  runInjectionCheck,
} from './prompt-injection/runInjectionCheck';
export { InjectionIgnoreList, MAX_IGNORE_ENTRIES } from './prompt-injection/InjectionIgnoreList';
export {
  evidenceHashOf,
  filterIgnoredFindings,
  ignoreEntryFor,
  isIgnoredBy,
  type FilteredResult,
  type IgnoreContext,
  type IgnoreEntry,
  type IgnoreScope,
} from './prompt-injection/ignoreFindings';
export { isAgentFileLocation } from './prompt-injection/isAgentFileLocation';
export { isTooLargeForRichText, MAX_RICH_TEXT_DOCUMENT_BYTES } from './documents/richTextSizeLimit';
export { topLevelYamlValue } from './spec-projects/yaml/readTopLevelYamlEntries';
