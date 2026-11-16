import {
  READING_WIDTHS,
  THEME_PREFERENCES,
  TYPOGRAPHIES,
  EDITING_MODES,
  WorkspaceKindsState,
  WORKSPACE_KINDS,
  isBuiltInSnippetId,
  type Snippet,
} from '@mdx/core';
import type { MessageKey, Translator } from '@mdx/i18n';
import { kindNameOf } from '../control-wheel/kindPresentation';
import { COMMAND_SHORTCUTS, type CommandShortcut } from '../shortcuts/commandShortcuts';
import { describeCombination } from '../shortcuts/describeCombination';
import type { ViewerCommand } from '../viewer/viewerCommands';
import type { WorkspacesView } from '../viewer/ViewerController';
import { workspaceNameOf } from '../workspaces/workspaceCommands';

export interface PaletteCommand {
  readonly command: ViewerCommand;
  readonly label: string;
  readonly shortcut?: string;
}

export interface PaletteContext {
  /** The keys each command has now, including the user's changes. */
  readonly shortcuts: readonly CommandShortcut[];
  readonly workspaceKinds: WorkspaceKindsState;
  readonly snippets?: readonly Snippet[];
  /** Absent while the earlier state file stands in for the workspace store. */
  readonly workspaces?: WorkspacesView;
  /** A Notes workspace is shown, so its daily note, templates and trash are offered. */
  readonly isNotesWorkspace?: boolean;
  /** The editor's caret is in a link, so Open Link is offered. */
  readonly isCaretInLink?: boolean;
  /** A document is shown, so commands that act on it, such as the prompt injection check, are offered. */
  readonly hasDocument?: boolean;
}

const DEFAULT_PALETTE_CONTEXT: PaletteContext = {
  shortcuts: COMMAND_SHORTCUTS,
  workspaceKinds: WorkspaceKindsState.initial(WORKSPACE_KINDS),
};

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
  { command: { kind: 'toggleHiddenCharacters' }, actionKey: 'promptInjection.hiddenCharacters.toggle' },
  { command: { kind: 'showAbout' }, actionKey: 'menu.help.about' },
  { command: { kind: 'confirmClearAllData' }, actionKey: 'privacy.clearAllData' },
  { command: { kind: 'showWorkspaceKindSettings' }, actionKey: 'workspaceKinds.choose' },
  { command: { kind: 'showWordGoal' }, actionKey: 'wordGoal.set' },
  { command: { kind: 'clearWordGoal' }, actionKey: 'wordGoal.clear' },
  { command: { kind: 'revertDocument' }, actionKey: 'menu.file.revert' },
  { command: { kind: 'runEditorCommand', command: 'undo' }, actionKey: 'menu.edit.undo' },
  { command: { kind: 'runEditorCommand', command: 'redo' }, actionKey: 'menu.edit.redo' },
  { command: { kind: 'runEditorCommand', command: 'replace' }, actionKey: 'menu.edit.replace' },
  { command: { kind: 'runEditorCommand', command: 'goToLine' }, actionKey: 'menu.edit.goToLine' },
  { command: { kind: 'runEditorCommand', command: 'insertEquation' }, actionKey: 'equation.insertCommand' },
  { command: { kind: 'runEditorCommand', command: 'copyLineUp' }, actionKey: 'menu.edit.copyLineUp' },
  { command: { kind: 'runEditorCommand', command: 'copyLineDown' }, actionKey: 'menu.edit.copyLineDown' },
  {
    command: { kind: 'runEditorCommand', command: 'addNextOccurrence' },
    actionKey: 'menu.edit.addNextOccurrence',
  },
];

/** Every command the palette offers, labelled as in the menus, with its shortcut where it has one. */
export function paletteCommands(
  translator: Translator,
  {
    shortcuts,
    workspaceKinds,
    snippets = [],
    workspaces,
    isNotesWorkspace = false,
    isCaretInLink = false,
    hasDocument = false,
  }: PaletteContext = DEFAULT_PALETTE_CONTEXT,
): PaletteCommand[] {
  return [
    ...menuCommands(shortcuts, translator),
    ...(isCaretInLink ? [openLinkCommand(translator)] : []),
    ...workspaceKindCommands(workspaceKinds, translator),
    ...(workspaces ? workspaceCommands(workspaces, workspaceKinds, translator) : []),
    ...(isNotesWorkspace ? notesCommands(translator) : []),
    ...(hasDocument ? documentCommands(translator) : []),
    ...snippetCommands(snippets, translator),
    ...themeCommands(translator),
    ...readingWidthCommands(translator),
    ...typographyCommands(translator),
    ...editingModeCommands(translator),
  ];
}

function menuCommands(shortcuts: PaletteContext['shortcuts'], translator: Translator): PaletteCommand[] {
  const withShortcuts = shortcuts
    .filter(({ command }) => command.kind !== 'showCommandPalette')
    .map(({ command, combinations, actionKey }) => {
      const [combination] = combinations;
      return {
        command,
        label: translator.translate(actionKey),
        ...(combination ? { shortcut: describeCombination(combination, translator) } : {}),
      };
    });
  const withoutShortcuts = COMMANDS_WITHOUT_SHORTCUTS.map(({ command, actionKey }) => ({
    command,
    label: translator.translate(actionKey),
  }));
  return [...withShortcuts, ...withoutShortcuts];
}

function editingModeCommands(translator: Translator): PaletteCommand[] {
  const group = translator.translate('menu.view.editingMode');
  return EDITING_MODES.map((editingMode) => ({
    command: { kind: 'setEditingMode', editingMode },
    label: translator.translate('palette.groupedAction', {
      group,
      action: translator.translate(`menu.view.editingMode.${editingMode}`),
    }),
  }));
}

function openLinkCommand(translator: Translator): PaletteCommand {
  return {
    command: { kind: 'runEditorCommand', command: 'openLink' },
    label: translator.translate('editor.action.openLink'),
  };
}

function documentCommands(translator: Translator): PaletteCommand[] {
  return [
    {
      command: { kind: 'checkForPromptInjection' },
      label: translator.translate('promptInjection.command.check'),
    },
  ];
}

function notesCommands(translator: Translator): PaletteCommand[] {
  return [
    { command: { kind: 'openTodaysNote' }, label: translator.translate('notes.today') },
    { command: { kind: 'showNewNoteFromTemplate' }, label: translator.translate('notes.fromTemplate') },
    { command: { kind: 'showNoteTrash' }, label: translator.translate('notes.tree.showTrash') },
  ];
}

/** New, Rename and Delete Workspace, and a switch to each other workspace of an enabled kind. */
function workspaceCommands(
  workspaces: WorkspacesView,
  workspaceKinds: WorkspaceKindsState,
  translator: Translator,
): PaletteCommand[] {
  const group = translator.translate('workspaces.palette.group');
  const switches = workspaces.registry
    .recentlyShown(workspaceKinds)
    .filter((workspace) => workspace.id !== workspaces.shownWorkspaceId)
    .map((workspace) => ({
      command: { kind: 'switchWorkspace', workspaceId: workspace.id } as const,
      label: translator.translate('palette.groupedAction', {
        group,
        action: workspaceNameOf(workspace, translator),
      }),
    }));
  return [
    { command: { kind: 'showNewWorkspace' }, label: translator.translate('workspaces.new') },
    { command: { kind: 'showRenameWorkspace' }, label: translator.translate('workspaces.rename') },
    { command: { kind: 'confirmDeleteWorkspace' }, label: translator.translate('workspaces.delete') },
    { command: { kind: 'openWorkspaceFile' }, label: translator.translate('workspaces.openFile') },
    { command: { kind: 'exportWorkspace' }, label: translator.translate('workspaces.export') },
    ...switches,
  ];
}

/** A switch to each enabled kind other than the one shown; planned and turned-off kinds are left out. */
function workspaceKindCommands(
  workspaceKinds: WorkspaceKindsState,
  translator: Translator,
): PaletteCommand[] {
  const group = translator.translate('workspaceKinds.palette.group');
  return workspaceKinds
    .enabledKindIds()
    .filter((kindId) => kindId !== workspaceKinds.activeKindId())
    .map((kindId) => ({
      command: { kind: 'switchWorkspaceKind', kindId },
      label: translator.translate('palette.groupedAction', { group, action: kindNameOf(kindId, translator) }),
    }));
}

function snippetCommands(snippets: readonly Snippet[], translator: Translator): PaletteCommand[] {
  const group = translator.translate('snippets.palette.group');
  return snippets.map((snippet) => ({
    command: { kind: 'insertSnippet', snippetId: snippet.id },
    label: translator.translate('palette.groupedAction', {
      group,
      action: snippetNameOf(snippet, translator),
    }),
  }));
}

/** Built-in snippets are named in the display language; the user's keep the names they gave. */
export function snippetNameOf(snippet: Snippet, translator: Translator): string {
  return isBuiltInSnippetId(snippet.id)
    ? translator.translate(`snippets.builtIn.${snippet.id.slice('builtIn.'.length)}` as MessageKey)
    : snippet.name;
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
