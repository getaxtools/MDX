import {
  DocumentOpenError,
  isDocumentOpenFailure,
  type DocumentFilePort,
  type DocumentLocation,
  type OpenedDocument,
  type PathStatus,
} from '@mdx/platform';
import { tauriCommands } from './tauriCommands';

export class TauriDocumentFiles implements DocumentFilePort {
  async open(path: string): Promise<OpenedDocument> {
    try {
      return await tauriCommands.openDocument(path);
    } catch (error) {
      throw new DocumentOpenError(failureCodeOf(error), path);
    }
  }

  async checkPathStatuses(locations: readonly DocumentLocation[]): Promise<ReadonlyMap<string, PathStatus>> {
    const statuses = await tauriCommands.checkPathStatuses(locations.map((location) => location.displayPath));
    return new Map(
      locations.map((location, index) => [location.canonicalKey, statuses[index] ?? 'unreachable']),
    );
  }
}

function failureCodeOf(error: unknown) {
  const code: unknown =
    typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  return isDocumentOpenFailure(code) ? code : 'unreadable';
}
