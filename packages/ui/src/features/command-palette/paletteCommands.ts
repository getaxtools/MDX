import { READING_WIDTHS, THEME_PREFERENCES, TYPOGRAPHIES } from '@mdx/core';
import type { MessageKey, Translator } from '@mdx/i18n';
import { COMMAND_SHORTCUTS } from '../shortcuts/commandShortcuts';
import { describeCombination } from '../shortcuts/describeCombination';
import type { ViewerCommand } from '../viewer/viewerCommands';

export interface PaletteCommand {
  readonly command: ViewerCommand;
  readonly label: string;
  readonly shortcut?: string;
}

interface CommandWithoutShortcut {
  readonly command: ViewerCommand;
  readonly actionKey: MessageKey;
}

const COMMANDS_WITHOUT_SHORTCUTS: readonly CommandWithoutShortcut[] = [
  { command: { kind: 'openFolder' }, actionKey: 'menu.file.openFolder' },
  { command: { kind: 'addFolderFavourite' }, actionKey: 'favourites.addFolder' },
  { command: { kind: 'refreshFolders' }, actionKey: 'favourites.folder.refreshAll' },
  { command: { kind: 'exportFavourites' }, actionKey: 'menu.file.exportFavourites' },
  { command: { kind: 'importFavourites' }, actionKey: 'menu.file.importFavourites' },
  { command: { kind: 'clearUnpinnedRecentFiles' }, actionKey: 'recentFiles.clearUnpinned' },
  { command: { kind: 'togglePinActiveTab' }, actionKey: 'menu.window.togglePin' },
  { command: { kind: 'closeInactiveTabs' }, actionKey: 'menu.window.closeOthers' },
  { command: { kind: 'closeTabsRightOfActive' }, actionKey: 'menu.window.closeToTheRight' },
  { command: { kind: 'copyAsHtml' }, actionKey: 'menu.edit.copyAsHtml' },
  { command: { kind: 'exportDocument', format: 'html' }, actionKey: 'menu.file.exportAsHtml' },
  { command: { kind: 'exportDocument', format: 'plainText' }, actionKey: 'menu.file.exportAsPlainText' },
  { command: { kind: 'toggleStatusBar' }, actionKey: 'menu.view.toggleStatusBar' },
  { command: { kind: 'toggleBreadcrumbs' }, actionKey: 'settings.breadcrumbs.label' },
  { command: { kind: 'showAbout' }, actionKey: 'menu.help.about' },
  { command: { kind: 'confirmClearAllData' }, actionKey: 'privacy.clearAllData' },
  { command: { kind: 'revertDocument' }, actionKey: 'menu.file.revert' },
  { command: { kind: 'runEditorCommand', command: 'undo' }, actionKey: 'menu.edit.undo' },
  { command: { kind: 'runEditorCommand', command: 'redo' }, actionKey: 'menu.edit.redo' },
  { command: { kind: 'runEditorCommand', command: 'replace' }, actionKey: 'menu.edit.replace' },
  { command: { kind: 'runEditorCommand', command: 'goToLine' }, actionKey: 'menu.edit.goToLine' },
];

/** Every command the palette offers, labelled as in the menus, with its shortcut where it has one. */
export function paletteCommands(translator: Translator): PaletteCommand[] {
  const withShortcuts = COMMAND_SHORTCUTS.filter(({ command }) => command.kind !== 'showCommandPalette').map(
    ({ command, combinations, actionKey }) => {
      const [combination] = combinations;
      return {
        command,
        label: translator.translate(actionKey),
        ...(combination ? { shortcut: describeCombination(combination, translator) } : {}),
      };
    },
  );
  const withoutShortcuts = COMMANDS_WITHOUT_SHORTCUTS.map(({ command, actionKey }) => ({
    command,
    label: translator.translate(actionKey),
  }));
  return [
    ...withShortcuts,
    ...withoutShortcuts,
    ...themeCommands(translator),
    ...readingWidthCommands(translator),
    ...typographyCommands(translator),
  ];
}

function themeCommands(translator: Translator): PaletteCommand[] {
  const group = translator.translate('menu.view.theme');
  return THEME_PREFERENCES.map((theme) => ({
    command: { kind: 'setTheme', theme },
    label: translator.translate('palette.groupedAction', {
      group,
      action: translator.translate(`menu.view.theme.${theme}`),
    }),
  }));
}

function readingWidthCommands(translator: Translator): PaletteCommand[] {
  const group = translator.translate('menu.view.readingWidth');
  return READING_WIDTHS.map((readingWidth) => ({
    command: { kind: 'setReadingWidth', readingWidth },
    label: translator.translate('palette.groupedAction', {
      group,
      action: translator.translate(`menu.view.readingWidth.${readingWidth}`),
    }),
  }));
}

function typographyCommands(translator: Translator): PaletteCommand[] {
  const group = translator.translate('menu.view.typography');
  return TYPOGRAPHIES.map((typography) => ({
    command: { kind: 'setTypography', typography },
    label: translator.translate('palette.groupedAction', {
      group,
      action: translator.translate(`menu.view.typography.${typography}`),
    }),
  }));
}
