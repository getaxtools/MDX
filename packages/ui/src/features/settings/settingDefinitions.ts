import {
  READING_WIDTHS,
  THEME_PREFERENCES,
  TYPOGRAPHIES,
  ZOOM_LEVELS_PERCENT,
  type ReadingWidth,
  type ThemePreference,
  type Typography,
  type ViewSettings,
} from '@mdx/core';
import { SUPPORTED_LOCALES, isKnownLocale, type MessageKey, type Translator } from '@mdx/i18n';
import type { ViewerCommand } from '../viewer/viewerCommands';

export type SettingSection = 'appearance' | 'language' | 'layout';

export const SETTING_SECTIONS: readonly SettingSection[] = ['appearance', 'language', 'layout'];

export interface SettingChoice {
  readonly value: string;
  readonly label: string;
}

interface SettingBase {
  readonly id: string;
  readonly section: SettingSection;
  readonly labelKey: MessageKey;
  readonly descriptionKey: MessageKey;
}

export interface ChoiceSetting extends SettingBase {
  readonly kind: 'choice';
  choices(translator: Translator): readonly SettingChoice[];
  valueIn(settings: ViewSettings): string;
  commandFor(value: string): ViewerCommand | undefined;
}

export interface ToggleSetting extends SettingBase {
  readonly kind: 'toggle';
  isOnIn(settings: ViewSettings): boolean;
  readonly toggleCommand: ViewerCommand;
}

export type SettingDefinition = ChoiceSetting | ToggleSetting;

const themeSetting: ChoiceSetting = {
  id: 'theme',
  kind: 'choice',
  section: 'appearance',
  labelKey: 'menu.view.theme',
  descriptionKey: 'settings.theme.description',
  choices: (translator) =>
    THEME_PREFERENCES.map((theme) => ({
      value: theme,
      label: translator.translate(`menu.view.theme.${theme}`),
    })),
  valueIn: (settings) => settings.theme,
  commandFor: (value) => {
    const theme = THEME_PREFERENCES.find((preference) => preference === value);
    return theme ? { kind: 'setTheme', theme: theme satisfies ThemePreference } : undefined;
  },
};

const typographySetting: ChoiceSetting = {
  id: 'typography',
  kind: 'choice',
  section: 'appearance',
  labelKey: 'menu.view.typography',
  descriptionKey: 'settings.typography.description',
  choices: (translator) =>
    TYPOGRAPHIES.map((typography) => ({
      value: typography,
      label: translator.translate(`menu.view.typography.${typography}`),
    })),
  valueIn: (settings) => settings.typography,
  commandFor: (value) => {
    const typography = TYPOGRAPHIES.find((preset) => preset === value);
    return typography ? { kind: 'setTypography', typography: typography satisfies Typography } : undefined;
  },
};

const readingWidthSetting: ChoiceSetting = {
  id: 'readingWidth',
  kind: 'choice',
  section: 'appearance',
  labelKey: 'menu.view.readingWidth',
  descriptionKey: 'settings.readingWidth.description',
  choices: (translator) =>
    READING_WIDTHS.map((width) => ({
      value: width,
      label: translator.translate(`menu.view.readingWidth.${width}`),
    })),
  valueIn: (settings) => settings.readingWidth,
  commandFor: (value) => {
    const readingWidth = READING_WIDTHS.find((width) => width === value);
    return readingWidth
      ? { kind: 'setReadingWidth', readingWidth: readingWidth satisfies ReadingWidth }
      : undefined;
  },
};

const zoomSetting: ChoiceSetting = {
  id: 'zoom',
  kind: 'choice',
  section: 'appearance',
  labelKey: 'settings.zoom.label',
  descriptionKey: 'settings.zoom.description',
  choices: (translator) =>
    ZOOM_LEVELS_PERCENT.map((percent) => ({
      value: String(percent),
      label: translator.translate('settings.zoom.choice', { percent }),
    })),
  valueIn: (settings) => String(settings.zoomPercent),
  commandFor: (value) => ({ kind: 'setZoom', zoomPercent: Number(value) }),
};

const SYSTEM_LANGUAGE = 'system';

const languageSetting: ChoiceSetting = {
  id: 'language',
  kind: 'choice',
  section: 'language',
  labelKey: 'settings.language.label',
  descriptionKey: 'settings.language.description',
  choices: (translator) => [
    { value: SYSTEM_LANGUAGE, label: translator.translate('settings.language.system') },
    ...SUPPORTED_LOCALES.map(({ tag, nativeName }) => ({ value: tag, label: nativeName })),
  ],
  valueIn: (settings) => settings.language,
  commandFor: (value) =>
    value === SYSTEM_LANGUAGE || isKnownLocale(value) ? { kind: 'setLanguage', language: value } : undefined,
};

function layoutToggle(
  setting: Pick<ToggleSetting, 'id' | 'labelKey' | 'descriptionKey' | 'toggleCommand'>,
  isOnIn: (settings: ViewSettings) => boolean,
): ToggleSetting {
  return { ...setting, kind: 'toggle', section: 'layout', isOnIn };
}

export const SETTING_DEFINITIONS: readonly SettingDefinition[] = [
  themeSetting,
  typographySetting,
  readingWidthSetting,
  zoomSetting,
  languageSetting,
  layoutToggle(
    {
      id: 'explorer',
      labelKey: 'settings.explorer.label',
      descriptionKey: 'settings.explorer.description',
      toggleCommand: { kind: 'toggleSidebar' },
    },
    (settings) => settings.isSidebarVisible,
  ),
  layoutToggle(
    {
      id: 'outline',
      labelKey: 'menu.view.toggleOutline',
      descriptionKey: 'settings.outline.description',
      toggleCommand: { kind: 'toggleOutline' },
    },
    (settings) => settings.isOutlineVisible,
  ),
  layoutToggle(
    {
      id: 'breadcrumbs',
      labelKey: 'settings.breadcrumbs.label',
      descriptionKey: 'settings.breadcrumbs.description',
      toggleCommand: { kind: 'toggleBreadcrumbs' },
    },
    (settings) => settings.isBreadcrumbsVisible,
  ),
  layoutToggle(
    {
      id: 'statusBar',
      labelKey: 'menu.view.toggleStatusBar',
      descriptionKey: 'settings.statusBar.description',
      toggleCommand: { kind: 'toggleStatusBar' },
    },
    (settings) => settings.isStatusBarVisible,
  ),
  layoutToggle(
    {
      id: 'previewBesideEditor',
      labelKey: 'menu.view.previewBeside',
      descriptionKey: 'settings.previewBesideEditor.description',
      toggleCommand: { kind: 'togglePreviewBesideEditor' },
    },
    (settings) => settings.isPreviewBesideEditor,
  ),
];

/** The settings whose section, name, description or choices contain every word of the query. */
export function matchingSettings(query: string, translator: Translator): SettingDefinition[] {
  return SETTING_DEFINITIONS.filter((setting) => matchesQuery(query, searchableTextOf(setting, translator)));
}

/** True when the text contains every word of the query, ignoring case and accents. */
export function matchesQuery(query: string, text: string): boolean {
  const words = foldForSearch(query).split(/\s+/u).filter(Boolean);
  const searchable = foldForSearch(text);
  return words.every((word) => searchable.includes(word));
}

function searchableTextOf(setting: SettingDefinition, translator: Translator): string {
  const choices = setting.kind === 'choice' ? setting.choices(translator).map((choice) => choice.label) : [];
  return [
    translator.translate(`settings.section.${setting.section}`),
    translator.translate(setting.labelKey),
    translator.translate(setting.descriptionKey),
    ...choices,
  ].join(' ');
}

const COMBINING_MARKS = /\p{M}/gu;

function foldForSearch(text: string): string {
  return text.normalize('NFD').replace(COMBINING_MARKS, '').toLocaleLowerCase();
}
