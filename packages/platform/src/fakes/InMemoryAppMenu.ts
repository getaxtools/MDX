import type { AppMenuPort, MenuCommandListener, ViewMenuState } from '../AppMenuPort';

export class InMemoryAppMenu implements AppMenuPort {
  private readonly listeners = new Set<MenuCommandListener>();
  shownViewState: ViewMenuState | undefined;
  shownRecentFiles: readonly string[] | undefined;
  shownLabels: Readonly<Record<string, string>> | undefined;

  onMenuCommand(listener: MenuCommandListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  showViewState(state: ViewMenuState): Promise<void> {
    this.shownViewState = state;
    return Promise.resolve();
  }

  showRecentFiles(displayPaths: readonly string[]): Promise<void> {
    this.shownRecentFiles = displayPaths;
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
