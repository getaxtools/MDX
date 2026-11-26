import type {
  AppMenuPort,
  MenuCommandListener,
  RecentWorkspaceMenuEntry,
  ViewMenuState,
} from '@mdx/platform';
import { MENU_COMMAND_EVENT, tauriCommands } from './tauriCommands';
import { listenInThisWindow } from './windowEvents';

export class TauriAppMenu implements AppMenuPort {
  onMenuCommand(listener: MenuCommandListener): () => void {
    return listenInThisWindow<string>(MENU_COMMAND_EVENT, (event) => listener(event.payload));
  }

  async showViewState(state: ViewMenuState): Promise<void> {
    await tauriCommands.updateViewMenu(state);
  }

  async showRecentFiles(
    displayPaths: readonly string[],
    workspaces: readonly RecentWorkspaceMenuEntry[] = [],
  ): Promise<void> {
    await tauriCommands.updateRecentMenu(displayPaths, workspaces);
  }

  async showShortcuts(shortcutTexts: Readonly<Record<string, string>>): Promise<void> {
    await tauriCommands.updateMenuShortcuts(shortcutTexts);
  }

  async showLabels(labels: Readonly<Record<string, string>>): Promise<void> {
    await tauriCommands.updateMenuLanguage(labels);
  }
}
