import type { DocumentExportPort, ExportFormat } from '@mdx/platform';
import { tauriCommands } from './tauriCommands';

export class TauriDocumentExport implements DocumentExportPort {
  async exportDocument(
    contents: string,
    suggestedFileName: string,
    format: ExportFormat,
  ): Promise<string | undefined> {
    return (await tauriCommands.exportDocument(contents, suggestedFileName, format)) ?? undefined;
  }
}
