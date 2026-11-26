import { parseViewSettings, type ViewSettings } from './ViewSettings';

/** Saved per window and workspace: what the side bar shows, panel sizes and the editor split. */
export const WORKSPACE_LAYOUT_FIELDS = [
  'isSidebarVisible',
  'sidebarView',
  'collapsedExplorerSections',
  'explorerSectionHeights',
  'panelWidths',
  'isPreviewBesideEditor',
  'editorSharePercent',
] as const satisfies readonly (keyof ViewSettings)[];

/** App settings a workspace may replace with its own value; zoom and language always stay app-wide. */
export const WORKSPACE_OVERRIDE_FIELDS = [
  'theme',
  'readingWidth',
  'typography',
] as const satisfies readonly (keyof ViewSettings)[];

type WorkspaceLayoutField = (typeof WORKSPACE_LAYOUT_FIELDS)[number];

export type WorkspaceLayout = Pick<ViewSettings, WorkspaceLayoutField>;
export type AppSettings = Omit<ViewSettings, WorkspaceLayoutField>;
export type WorkspaceOverrides = Partial<Pick<ViewSettings, WorkspaceOverrideField>>;

export interface ScopedViewSettings {
  readonly appSettings: AppSettings;
  readonly layout: WorkspaceLayout;
}

export function splitViewSettings(view: ViewSettings): ScopedViewSettings {
  const isLayoutField = (field: string) => (WORKSPACE_LAYOUT_FIELDS as readonly string[]).includes(field);
  const entries = Object.entries(view);
  const appSettings = Object.fromEntries(entries.filter(([field]) => !isLayoutField(field)));
  const layout = Object.fromEntries(entries.filter(([field]) => isLayoutField(field)));
  return { appSettings: appSettings as AppSettings, layout: layout as WorkspaceLayout };
}

/** What the UI shows: the workspace's layout, then its overrides, then the app setting. */
export function effectiveViewSettings(
  { appSettings, layout }: ScopedViewSettings,
  overrides: WorkspaceOverrides = {},
): ViewSettings {
  return { ...appSettings, ...layout, ...overrides };
}

/** Reads saved app settings and layout with the same field rules as the earlier view settings. */
export function parseScopedViewSettings(savedAppSettings: unknown, savedLayout: unknown): ScopedViewSettings {
  const appSettings = splitViewSettings(parseViewSettings(savedAppSettings)).appSettings;
  const layout = splitViewSettings(parseViewSettings(savedLayout)).layout;
  return { appSettings, layout };
}

export type WorkspaceOverrideField = (typeof WORKSPACE_OVERRIDE_FIELDS)[number];

/** What the window shows: the app settings with the shown workspace's overrides on top. */
export function withOverrides(appSettings: ViewSettings, overrides: WorkspaceOverrides): ViewSettings {
  return { ...appSettings, ...overrides };
}

/**
 * Applies a change to what the window shows: an overridden field changes the workspace's override, and
 * every other field the app setting, so a change always shows.
 */
export function changeShownSettings(
  appSettings: ViewSettings,
  overrides: WorkspaceOverrides,
  change: (shown: ViewSettings) => ViewSettings,
): { readonly appSettings: ViewSettings; readonly overrides: WorkspaceOverrides } {
  const changed = change(withOverrides(appSettings, overrides));
  const overriddenFields = WORKSPACE_OVERRIDE_FIELDS.filter((field) => field in overrides);
  return {
    appSettings: {
      ...changed,
      ...Object.fromEntries(overriddenFields.map((field) => [field, appSettings[field]])),
    },
    overrides: Object.fromEntries(overriddenFields.map((field) => [field, changed[field]])),
  };
}

/** Starting an override keeps what is shown; clearing it falls back to the app setting. */
export function setOverride(
  appSettings: ViewSettings,
  overrides: WorkspaceOverrides,
  { field, isOverridden }: { readonly field: WorkspaceOverrideField; readonly isOverridden: boolean },
): WorkspaceOverrides {
  const remaining = Object.fromEntries(
    Object.entries(overrides).filter(([overridden]) => overridden !== field),
  );
  return isOverridden ? { ...remaining, [field]: withOverrides(appSettings, overrides)[field] } : remaining;
}

/** Keeps only allowlisted fields whose saved value is valid; anything else falls back to the app setting. */
export function parseWorkspaceOverrides(saved: unknown): WorkspaceOverrides {
  if (typeof saved !== 'object' || saved === null) return {};
  const parsed = parseViewSettings(saved);
  return Object.fromEntries(
    WORKSPACE_OVERRIDE_FIELDS.filter(
      (field) => field in saved && (saved as Record<string, unknown>)[field] === parsed[field],
    ).map((field) => [field, parsed[field]]),
  );
}
