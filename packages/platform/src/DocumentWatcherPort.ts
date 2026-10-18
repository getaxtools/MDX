export type DocumentsChangedListener = (displayPaths: readonly string[]) => void;

export interface DocumentWatcherPort {
  /** Watches exactly these documents for changes made by other programs. */
  watch(displayPaths: readonly string[]): Promise<void>;
  onDocumentsChanged(listener: DocumentsChangedListener): () => void;
}
