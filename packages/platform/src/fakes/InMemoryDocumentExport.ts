import type { DocumentExportPort, ExportFormat } from '../DocumentExportPort';

export interface ExportedDocument {
  readonly contents: string;
  readonly suggestedFileName: string;
  readonly format: ExportFormat;
}

export class InMemoryDocumentExport implements DocumentExportPort {
  readonly exported: ExportedDocument[] = [];
  /** Where the next export is saved; undefined acts as if the user cancelled. */
  chosenFolder: string | undefined = 'C:\\Exports';
  isFailing = false;

  exportDocument(
    contents: string,
    suggestedFileName: string,
    format: ExportFormat,
  ): Promise<string | undefined> {
    if (this.isFailing) return Promise.reject(new Error('The export could not be written'));
    if (this.chosenFolder === undefined) return Promise.resolve(undefined);
    this.exported.push({ contents, suggestedFileName, format });
    return Promise.resolve(`${this.chosenFolder}\\${suggestedFileName}`);
  }
}
