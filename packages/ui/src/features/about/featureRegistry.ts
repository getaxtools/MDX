import type { MessageKey } from '@mdx/i18n';

export interface InstalledFeature {
  readonly id: string;
  readonly labelKey: MessageKey;
}

/** The features of this version, listed in About. Add a feature here when it ships. */
export const INSTALLED_FEATURES: readonly InstalledFeature[] = [
  { id: 'tabs', labelKey: 'about.feature.tabs' },
  { id: 'favourites', labelKey: 'about.feature.favourites' },
  { id: 'favouriteGroups', labelKey: 'about.feature.favouriteGroups' },
  { id: 'favouritesFile', labelKey: 'about.feature.favouritesFile' },
  { id: 'explorer', labelKey: 'about.feature.explorer' },
  { id: 'recentFiles', labelKey: 'about.feature.recentFiles' },
  { id: 'safeRendering', labelKey: 'about.feature.safeRendering' },
  { id: 'codeHighlighting', labelKey: 'about.feature.codeHighlighting' },
  { id: 'math', labelKey: 'about.feature.math' },
  { id: 'outline', labelKey: 'about.feature.outline' },
  { id: 'find', labelKey: 'about.feature.find' },
  { id: 'liveReload', labelKey: 'about.feature.liveReload' },
  { id: 'relativeLinks', labelKey: 'about.feature.relativeLinks' },
  { id: 'frontMatter', labelKey: 'about.feature.frontMatter' },
  { id: 'viewOptions', labelKey: 'about.feature.viewOptions' },
  { id: 'sourceView', labelKey: 'about.feature.sourceView' },
  { id: 'encodings', labelKey: 'about.feature.encodings' },
  { id: 'tablePaste', labelKey: 'about.feature.tablePaste' },
  { id: 'editing', labelKey: 'about.feature.editing' },
  { id: 'saving', labelKey: 'about.feature.saving' },
  { id: 'printing', labelKey: 'about.feature.printing' },
  { id: 'keyboardShortcuts', labelKey: 'about.feature.keyboardShortcuts' },
  { id: 'commandPalette', labelKey: 'about.feature.commandPalette' },
];
