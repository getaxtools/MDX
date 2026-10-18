export type MenuCommandListener = (menuItemId: string) => void;

export interface ViewMenuState {
  readonly theme: string;
  readonly readingWidth: string;
  readonly isSidebarVisible: boolean;
  readonly isOutlineVisible: boolean;
}

export interface AppMenuPort {
  onMenuCommand(listener: MenuCommandListener): () => void;
  showViewState(state: ViewMenuState): Promise<void>;
}
