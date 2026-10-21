export type ExportFormat = 'html' | 'plainText';

/** Saves an exported copy of a document, such as standalone HTML, where the user chooses. */
export interface DocumentExportPort {
  /** Resolves to the saved path, or undefined when the user cancels. */
  exportDocument(
    contents: string,
    suggestedFileName: string,
    format: ExportFormat,
  ): Promise<string | undefined>;
}
