import {
  resetZoom,
  zoomIn,
  zoomOut,
  type ReadingWidth,
  type ThemePreference,
  type ViewSettings,
} from '@mdx/core';

export type ViewCommand =
  | { readonly kind: 'zoomIn' }
  | { readonly kind: 'zoomOut' }
  | { readonly kind: 'resetZoom' }
  | { readonly kind: 'setTheme'; readonly theme: ThemePreference }
  | { readonly kind: 'setReadingWidth'; readonly readingWidth: ReadingWidth }
  | { readonly kind: 'toggleSidebar' }
  | { readonly kind: 'toggleOutline' }
  | { readonly kind: 'toggleStatusBar' };

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
  setTheme: (settings, { theme }) => ({ ...settings, theme }),
  setReadingWidth: (settings, { readingWidth }) => ({ ...settings, readingWidth }),
  toggleSidebar: (settings) => ({ ...settings, isSidebarVisible: !settings.isSidebarVisible }),
  toggleOutline: (settings) => ({ ...settings, isOutlineVisible: !settings.isOutlineVisible }),
  toggleStatusBar: (settings) => ({ ...settings, isStatusBarVisible: !settings.isStatusBarVisible }),
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
