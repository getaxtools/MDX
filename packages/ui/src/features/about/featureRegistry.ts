import { SUPPORTED_LOCALES, type MessageKey, type MessageValues } from '@mdx/i18n';

export interface InstalledFeature {
  readonly id: string;
  readonly labelKey: MessageKey;
  readonly labelValues?: MessageValues;
}

export interface FeatureGroup {
  readonly id: string;
  readonly labelKey: MessageKey;
  readonly features: readonly InstalledFeature[];
}

/** The features of this version, grouped the way About lists them. Add a feature here when it ships. */
export const INSTALLED_FEATURE_GROUPS: readonly FeatureGroup[] = [
  {
    id: 'reading',
    labelKey: 'about.featureGroup.reading',
    features: [
      { id: 'safeRendering', labelKey: 'about.feature.safeRendering' },
      { id: 'extendedSyntax', labelKey: 'about.feature.extendedSyntax' },
      { id: 'codeHighlighting', labelKey: 'about.feature.codeHighlighting' },
      { id: 'math', labelKey: 'about.feature.math' },
      { id: 'frontMatter', labelKey: 'about.feature.frontMatter' },
      { id: 'relativeLinks', labelKey: 'about.feature.relativeLinks' },
      { id: 'outline', labelKey: 'about.feature.outline' },
      { id: 'find', labelKey: 'about.feature.find' },
      { id: 'liveReload', labelKey: 'about.feature.liveReload' },
      { id: 'viewOptions', labelKey: 'about.feature.viewOptions' },
      { id: 'sourceView', labelKey: 'about.feature.sourceView' },
    ],
  },
  {
    id: 'filesAndNavigation',
    labelKey: 'about.featureGroup.filesAndNavigation',
    features: [
      { id: 'tabs', labelKey: 'about.feature.tabs' },
      { id: 'favourites', labelKey: 'about.feature.favourites' },
      { id: 'favouriteGroups', labelKey: 'about.feature.favouriteGroups' },
      { id: 'favouritesFile', labelKey: 'about.feature.favouritesFile' },
      { id: 'recentFiles', labelKey: 'about.feature.recentFiles' },
      { id: 'explorer', labelKey: 'about.feature.explorer' },
      { id: 'folderSearch', labelKey: 'about.feature.folderSearch' },
      { id: 'commandPalette', labelKey: 'about.feature.commandPalette' },
      { id: 'navigation', labelKey: 'about.feature.navigation' },
      { id: 'keyboardShortcuts', labelKey: 'about.feature.keyboardShortcuts' },
    ],
  },
  {
    id: 'editing',
    labelKey: 'about.featureGroup.editing',
    features: [
      { id: 'editing', labelKey: 'about.feature.editing' },
      { id: 'previewBesideEditor', labelKey: 'about.feature.previewBesideEditor' },
      { id: 'tablePaste', labelKey: 'about.feature.tablePaste' },
      { id: 'saving', labelKey: 'about.feature.saving' },
    ],
  },
  {
    id: 'printingAndSharing',
    labelKey: 'about.featureGroup.printingAndSharing',
    features: [
      { id: 'printing', labelKey: 'about.feature.printing' },
      { id: 'export', labelKey: 'about.feature.export' },
      { id: 'copyAsHtml', labelKey: 'about.feature.copyAsHtml' },
    ],
  },
  {
    id: 'languagesAndText',
    labelKey: 'about.featureGroup.languagesAndText',
    features: [
      {
        id: 'displayLanguages',
        labelKey: 'about.feature.displayLanguages',
        labelValues: { count: SUPPORTED_LOCALES.length },
      },
      { id: 'scripts', labelKey: 'about.feature.scripts' },
      { id: 'encodings', labelKey: 'about.feature.encodings' },
    ],
  },
];

export const INSTALLED_FEATURES: readonly InstalledFeature[] = INSTALLED_FEATURE_GROUPS.flatMap(
  (group) => group.features,
);
