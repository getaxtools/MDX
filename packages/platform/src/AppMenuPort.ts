export type MenuCommandListener = (menuItemId: string) => void;

export interface ViewMenuState {
  readonly theme: string;
  readonly readingWidth: string;
  readonly isSidebarVisible: boolean;
  readonly isOutlineVisible: boolean;
  readonly isStatusBarVisible: boolean;
  readonly isSourceView: boolean;
}

export interface AppMenuPort {
  onMenuCommand(listener: MenuCommandListener): () => void;
  showViewState(state: ViewMenuState): Promise<void>;
  /** Lists recent documents, newest first, under File > Open Recent. */
  showRecentFiles(displayPaths: readonly string[]): Promise<void>;
}
