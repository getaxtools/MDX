import type {
  DocumentFilePort,
  DocumentLocation,
  EditedDocumentSave,
  OpenedDocument,
  PathStatus,
  SaveSource,
} from '@mdx/platform';
import { documentOpenErrorOf } from './documentOpenErrorOf';
import { tauriCommands } from './tauriCommands';

export class TauriDocumentFiles implements DocumentFilePort {
  async open(path: string, encoding?: string): Promise<OpenedDocument> {
    try {
      return await tauriCommands.openDocument(path, encoding);
    } catch (error) {
      throw documentOpenErrorOf(error, path);
    }
  }

  async saveAs(source: SaveSource): Promise<string | undefined> {
    return (await tauriCommands.saveDocumentAs(source)) ?? undefined;
  }

  async save(document: EditedDocumentSave): Promise<number> {
    try {
      return await tauriCommands.saveDocument(document);
    } catch (error) {
      throw documentOpenErrorOf(error, document.path);
    }
  }

  async checkPathStatuses(locations: readonly DocumentLocation[]): Promise<ReadonlyMap<string, PathStatus>> {
    const statuses = await tauriCommands.checkPathStatuses(locations.map((location) => location.displayPath));
    return new Map(
      locations.map((location, index) => [location.canonicalKey, statuses[index] ?? 'unreachable']),
    );
  }
}
