export type DocumentRequestListener = (paths: readonly string[]) => void;

export interface DocumentRequestsPort {
  pickDocuments(): Promise<readonly string[]>;
  takeStartupDocuments(): Promise<readonly string[]>;
  onDocumentsRequested(listener: DocumentRequestListener): () => void;
}
