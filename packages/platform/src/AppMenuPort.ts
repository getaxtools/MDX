export type MenuCommandListener = (menuItemId: string) => void;

export interface ViewMenuState {
  readonly theme: string;
  readonly readingWidth: string;
  readonly typography: string;
  readonly isSidebarVisible: boolean;
  readonly isOutlineVisible: boolean;
  readonly isStatusBarVisible: boolean;
  readonly isSourceView: boolean;
  readonly isPreviewBesideEditor: boolean;
}

export interface AppMenuPort {
  onMenuCommand(listener: MenuCommandListener): () => void;
  showViewState(state: ViewMenuState): Promise<void>;
  /** Lists recent documents, newest first, under File > Open Recent. */
  showRecentFiles(displayPaths: readonly string[]): Promise<void>;
  /** Builds the menu again with these labels, keyed like the message catalog. */
  showLabels(labels: Readonly<Record<string, string>>): Promise<void>;
}
