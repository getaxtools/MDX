import {
  isSidebarViewShown,
  KIND_SWITCHERS,
  READING_WIDTHS,
  THEME_PREFERENCES,
  TYPOGRAPHIES,
  ZOOM_LEVELS_PERCENT,
  type ReadingWidth,
  type ThemePreference,
  type Typography,
  type ViewSettings,
  type WheelDock,
} from '@mdx/core';
import { SUPPORTED_LOCALES, directionOf, isKnownLocale, type MessageKey, type Translator } from '@mdx/i18n';
import type { ViewerCommand } from '../viewer/viewerCommands';

export type SettingSection = 'appearance' | 'language' | 'layout' | 'workspaceKinds' | 'keyboard';

export const SETTING_SECTIONS: readonly SettingSection[] = [
  'appearance',
  'language',
  'layout',
  'workspaceKinds',
  'keyboard',
];

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

/** A button that runs a command, such as opening the kind choices. */
export interface ActionSetting extends SettingBase {
  readonly kind: 'action';
  readonly buttonLabelKey: MessageKey;
  readonly command: ViewerCommand;
}

/** The keys of a command the user can change. */
export interface ShortcutKeysSetting extends SettingBase {
  readonly kind: 'shortcut';
  readonly commandId: string;
  readonly command: ViewerCommand;
  /** Explains how to give the keys to a mouse button. */
  readonly hasMouseButtonHelp: boolean;
}

export type SettingDefinition = ChoiceSetting | ToggleSetting | ActionSetting | ShortcutKeysSetting;

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

const kindSwitcherSetting: ChoiceSetting = {
  id: 'kindSwitcher',
  kind: 'choice',
  section: 'workspaceKinds',
  labelKey: 'settings.kindSwitcher.label',
  descriptionKey: 'settings.kindSwitcher.description',
  choices: (translator) =>
    KIND_SWITCHERS.map((kindSwitcher) => ({
      value: kindSwitcher,
      label: translator.translate(`settings.kindSwitcher.${kindSwitcher}`),
    })),
  valueIn: (settings) => settings.kindSwitcher,
  commandFor: (value) => {
    const kindSwitcher = KIND_SWITCHERS.find((switcher) => switcher === value);
    return kindSwitcher ? { kind: 'setKindSwitcher', kindSwitcher } : undefined;
  },
};

const WHEEL_DOCKS_IN_SCREEN_ORDER: readonly WheelDock[] = ['bottomInlineEnd', 'bottomInlineStart'];

/** The dock is stored by reading direction, so its label names the corner it is in on screen. */
function wheelDockLabelKey(wheelDock: WheelDock, translator: Translator): MessageKey {
  const isAtEndOfLine = wheelDock === 'bottomInlineEnd';
  const isOnTheRight = directionOf(translator.locale) === 'rtl' ? !isAtEndOfLine : isAtEndOfLine;
  return isOnTheRight ? 'settings.wheelDock.bottomRight' : 'settings.wheelDock.bottomLeft';
}

const wheelDockSetting: ChoiceSetting = {
  id: 'wheelDock',
  kind: 'choice',
  section: 'workspaceKinds',
  labelKey: 'settings.wheelDock.label',
  descriptionKey: 'settings.wheelDock.description',
  choices: (translator) =>
    WHEEL_DOCKS_IN_SCREEN_ORDER.map((wheelDock) => ({
      value: wheelDock,
      label: translator.translate(wheelDockLabelKey(wheelDock, translator)),
    })),
  valueIn: (settings) => settings.wheelDock,
  commandFor: (value) => {
    const wheelDock = WHEEL_DOCKS_IN_SCREEN_ORDER.find((dock) => dock === value);
    return wheelDock ? { kind: 'setWheelDock', wheelDock } : undefined;
  },
};

const WORKSPACE_KIND_SETTINGS: readonly SettingDefinition[] = [
  kindSwitcherSetting,
  wheelDockSetting,
  {
    id: 'wheelAtPointer',
    kind: 'toggle',
    section: 'workspaceKinds',
    labelKey: 'settings.wheelAtPointer.label',
    descriptionKey: 'settings.wheelAtPointer.description',
    isOnIn: (settings) => settings.isWheelOpenedAtPointer,
    toggleCommand: { kind: 'toggleWheelOpenedAtPointer' },
  },
  {
    id: 'wheelButton',
    kind: 'toggle',
    section: 'workspaceKinds',
    labelKey: 'settings.wheelButton.label',
    descriptionKey: 'settings.wheelButton.description',
    isOnIn: (settings) => settings.isWheelButtonInStatusBar,
    toggleCommand: { kind: 'toggleWheelButtonInStatusBar' },
  },
  {
    id: 'chooseKinds',
    kind: 'action',
    section: 'workspaceKinds',
    labelKey: 'settings.chooseKinds.label',
    descriptionKey: 'settings.chooseKinds.description',
    buttonLabelKey: 'workspaceKinds.choose',
    command: { kind: 'showWorkspaceKindSettings' },
  },
];

const KEYBOARD_SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'controlWheelShortcut',
    kind: 'shortcut',
    section: 'keyboard',
    labelKey: 'controlWheel.show',
    descriptionKey: 'settings.shortcut.controlWheel.description',
    commandId: 'toggleControlWheel',
    command: { kind: 'toggleControlWheel' },
    hasMouseButtonHelp: true,
  },
];

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
    (settings) => isSidebarViewShown(settings, 'explorer'),
  ),
  layoutToggle(
    {
      id: 'outline',
      labelKey: 'menu.view.toggleOutline',
      descriptionKey: 'settings.outline.description',
      toggleCommand: { kind: 'toggleOutline' },
    },
    (settings) => isSidebarViewShown(settings, 'outline'),
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
  ...WORKSPACE_KIND_SETTINGS,
  ...KEYBOARD_SETTINGS,
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
  return [
    translator.translate(`settings.section.${setting.section}`),
    translator.translate(setting.labelKey),
    translator.translate(setting.descriptionKey),
    ...extraSearchableTextOf(setting, translator),
  ].join(' ');
}

function extraSearchableTextOf(setting: SettingDefinition, translator: Translator): string[] {
  if (setting.kind === 'choice') return setting.choices(translator).map((choice) => choice.label);
  if (setting.kind === 'action') return [translator.translate(setting.buttonLabelKey)];
  return [];
}

const COMBINING_MARKS = /\p{M}/gu;

function foldForSearch(text: string): string {
  return text.normalize('NFD').replace(COMBINING_MARKS, '').toLocaleLowerCase();
}
