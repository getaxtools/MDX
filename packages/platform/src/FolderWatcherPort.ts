export type FoldersChangedListener = (folderPaths: readonly string[]) => void;

export interface FolderWatcherPort {
  /** Watches exactly these folders for Markdown documents and subfolders being added, renamed or removed. */
  watch(folderPaths: readonly string[]): Promise<void>;
  onFoldersChanged(listener: FoldersChangedListener): () => void;
}
