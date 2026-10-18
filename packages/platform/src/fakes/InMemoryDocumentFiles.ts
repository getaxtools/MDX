import type { DocumentFilePort, OpenedDocument, PathStatus } from '../DocumentFilePort';
import type { DocumentLocation } from '../DocumentLocation';
import { DocumentOpenError } from '../DocumentOpenError';

export class InMemoryDocumentFiles implements DocumentFilePort {
  private readonly textByKey = new Map<string, string>();
  private readonly unreachableKeys = new Set<string>();
  readonly openedPaths: string[] = [];

  constructor(textByPath: Readonly<Record<string, string>> = {}) {
    for (const [path, text] of Object.entries(textByPath)) this.write(path, text);
  }

  static locationOf(path: string): DocumentLocation {
    const fileName = path.split(/[\\/]/).at(-1) ?? path;
    return { canonicalKey: path.toLowerCase(), displayPath: path, fileName };
  }

  write(path: string, text: string): void {
    this.textByKey.set(InMemoryDocumentFiles.locationOf(path).canonicalKey, text);
  }

  delete(path: string): void {
    this.textByKey.delete(InMemoryDocumentFiles.locationOf(path).canonicalKey);
  }

  makeUnreachable(path: string): void {
    this.unreachableKeys.add(InMemoryDocumentFiles.locationOf(path).canonicalKey);
  }

  open(path: string): Promise<OpenedDocument> {
    this.openedPaths.push(path);
    const location = InMemoryDocumentFiles.locationOf(path);
    if (this.unreachableKeys.has(location.canonicalKey)) {
      return Promise.reject(new DocumentOpenError('unreachable', path));
    }
    const text = this.textByKey.get(location.canonicalKey);
    if (text === undefined) return Promise.reject(new DocumentOpenError('notFound', path));
    return Promise.resolve({
      location,
      text,
      encoding: 'utf-8',
      hasByteOrderMark: false,
      lineEnding: 'lf',
      modifiedAtMs: 0,
    });
  }

  checkPathStatuses(locations: readonly DocumentLocation[]): Promise<ReadonlyMap<string, PathStatus>> {
    const statuses = new Map(locations.map((location) => [location.canonicalKey, this.statusOf(location)]));
    return Promise.resolve(statuses);
  }

  private statusOf(location: DocumentLocation): PathStatus {
    if (this.unreachableKeys.has(location.canonicalKey)) return 'unreachable';
    return this.textByKey.has(location.canonicalKey) ? 'available' : 'missing';
  }
}
