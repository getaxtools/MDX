import type {
  AppMenuPort,
  MenuCommandListener,
  RecentWorkspaceMenuEntry,
  ViewMenuState,
} from '../AppMenuPort';

export class InMemoryAppMenu implements AppMenuPort {
  private readonly listeners = new Set<MenuCommandListener>();
  shownViewState: ViewMenuState | undefined;
  shownRecentFiles: readonly string[] | undefined;
  shownRecentWorkspaces: readonly RecentWorkspaceMenuEntry[] = [];
  shownLabels: Readonly<Record<string, string>> | undefined;
  shownShortcuts: Readonly<Record<string, string>> | undefined;

  onMenuCommand(listener: MenuCommandListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  showViewState(state: ViewMenuState): Promise<void> {
    this.shownViewState = state;
    return Promise.resolve();
  }

  showRecentFiles(
    displayPaths: readonly string[],
    workspaces: readonly RecentWorkspaceMenuEntry[] = [],
  ): Promise<void> {
    this.shownRecentFiles = displayPaths;
    this.shownRecentWorkspaces = workspaces;
    return Promise.resolve();
  }

  showShortcuts(shortcutTexts: Readonly<Record<string, string>>): Promise<void> {
    this.shownShortcuts = shortcutTexts;
    return Promise.resolve();
  }

  showLabels(labels: Readonly<Record<string, string>>): Promise<void> {
    this.shownLabels = labels;
    return Promise.resolve();
  }

  choose(menuItemId: string): void {
    for (const listener of this.listeners) listener(menuItemId);
  }
}
