import type { AppMenuPort, MenuCommandListener, ViewMenuState } from '../AppMenuPort';

export class InMemoryAppMenu implements AppMenuPort {
  private readonly listeners = new Set<MenuCommandListener>();
  shownViewState: ViewMenuState | undefined;

  onMenuCommand(listener: MenuCommandListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  showViewState(state: ViewMenuState): Promise<void> {
    this.shownViewState = state;
    return Promise.resolve();
  }

  choose(menuItemId: string): void {
    for (const listener of this.listeners) listener(menuItemId);
  }
}
