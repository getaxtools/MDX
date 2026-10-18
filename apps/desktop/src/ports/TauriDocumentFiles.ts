import type { DocumentFilePort, DocumentLocation, OpenedDocument, PathStatus } from '@mdx/platform';
import { documentOpenErrorOf } from './documentOpenErrorOf';
import { tauriCommands } from './tauriCommands';

export class TauriDocumentFiles implements DocumentFilePort {
  async open(path: string): Promise<OpenedDocument> {
    try {
      return await tauriCommands.openDocument(path);
    } catch (error) {
      throw documentOpenErrorOf(error, path);
    }
  }

  async checkPathStatuses(locations: readonly DocumentLocation[]): Promise<ReadonlyMap<string, PathStatus>> {
    const statuses = await tauriCommands.checkPathStatuses(locations.map((location) => location.displayPath));
    return new Map(
      locations.map((location, index) => [location.canonicalKey, statuses[index] ?? 'unreachable']),
    );
  }
}
