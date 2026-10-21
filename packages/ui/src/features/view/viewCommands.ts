import {
  resetPanelWidth,
  resetZoom,
  resizeExplorerSection,
  resizePanel,
  setEditorShare,
  setZoom,
  showSidebarView,
  toggleExplorerSection,
  toggleSidebarView,
  zoomIn,
  zoomOut,
  type ExplorerSection,
  type LanguagePreference,
  type ReadingWidth,
  type ResizablePanel,
  type SidebarView,
  type ThemePreference,
  type Typography,
  type ViewSettings,
} from '@mdx/core';

export type ViewCommand =
  | { readonly kind: 'zoomIn' }
  | { readonly kind: 'zoomOut' }
  | { readonly kind: 'resetZoom' }
  | { readonly kind: 'setZoom'; readonly zoomPercent: number }
  | { readonly kind: 'setTheme'; readonly theme: ThemePreference }
  | { readonly kind: 'setReadingWidth'; readonly readingWidth: ReadingWidth }
  | { readonly kind: 'setTypography'; readonly typography: Typography }
  | { readonly kind: 'setLanguage'; readonly language: LanguagePreference }
  | { readonly kind: 'toggleSidebar' }
  | { readonly kind: 'toggleSidebarView'; readonly sidebarView: SidebarView }
  | { readonly kind: 'toggleOutline' }
  | { readonly kind: 'toggleStatusBar' }
  | { readonly kind: 'toggleBreadcrumbs' }
  | { readonly kind: 'showSidebarView'; readonly sidebarView: SidebarView }
  | { readonly kind: 'toggleExplorerSection'; readonly section: ExplorerSection }
  | { readonly kind: 'resizeExplorerSection'; readonly section: ExplorerSection; readonly heightPx: number }
  | { readonly kind: 'resizePanel'; readonly panel: ResizablePanel; readonly widthPx: number }
  | { readonly kind: 'resetPanelWidth'; readonly panel: ResizablePanel }
  | { readonly kind: 'setEditorShare'; readonly sharePercent: number };

type ViewCommandHandlers = {
  readonly [Kind in ViewCommand['kind']]: (
    settings: ViewSettings,
    command: Extract<ViewCommand, { kind: Kind }>,
  ) => ViewSettings;
};

const VIEW_COMMAND_HANDLERS: ViewCommandHandlers = {
  zoomIn: (settings) => zoomIn(settings),
  zoomOut: (settings) => zoomOut(settings),
  resetZoom: (settings) => resetZoom(settings),
  setZoom: (settings, { zoomPercent }) => setZoom(settings, zoomPercent),
  setTheme: (settings, { theme }) => ({ ...settings, theme }),
  setReadingWidth: (settings, { readingWidth }) => ({ ...settings, readingWidth }),
  setTypography: (settings, { typography }) => ({ ...settings, typography }),
  setLanguage: (settings, { language }) => ({ ...settings, language }),
  toggleSidebar: (settings) => ({ ...settings, isSidebarVisible: !settings.isSidebarVisible }),
  toggleSidebarView: (settings, { sidebarView }) => toggleSidebarView(settings, sidebarView),
  toggleOutline: (settings) => ({ ...settings, isOutlineVisible: !settings.isOutlineVisible }),
  toggleStatusBar: (settings) => ({ ...settings, isStatusBarVisible: !settings.isStatusBarVisible }),
  toggleBreadcrumbs: (settings) => ({ ...settings, isBreadcrumbsVisible: !settings.isBreadcrumbsVisible }),
  showSidebarView: (settings, { sidebarView }) => showSidebarView(settings, sidebarView),
  toggleExplorerSection: (settings, { section }) => toggleExplorerSection(settings, section),
  resizeExplorerSection: (settings, { section, heightPx }) =>
    resizeExplorerSection(settings, section, heightPx),
  resizePanel: (settings, { panel, widthPx }) => resizePanel(settings, panel, widthPx),
  resetPanelWidth: (settings, { panel }) => resetPanelWidth(settings, panel),
  setEditorShare: (settings, { sharePercent }) => setEditorShare(settings, sharePercent),
};

export function isViewCommand(command: { readonly kind: string }): command is ViewCommand {
  return Object.hasOwn(VIEW_COMMAND_HANDLERS, command.kind);
}

export function applyViewCommand(settings: ViewSettings, command: ViewCommand): ViewSettings {
  const handler = VIEW_COMMAND_HANDLERS[command.kind] as (
    settings: ViewSettings,
    command: ViewCommand,
  ) => ViewSettings;
  return handler(settings, command);
}
