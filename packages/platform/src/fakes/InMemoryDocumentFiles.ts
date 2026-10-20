import type {
  DocumentFilePort,
  EditedDocumentSave,
  LineEnding,
  OpenedDocument,
  PathStatus,
  SaveSource,
} from '../DocumentFilePort';
import type { DocumentLocation } from '../DocumentLocation';
import { DocumentOpenError } from '../DocumentOpenError';

function lineEndingOf(text: string): LineEnding {
  const windowsBreaks = text.split('\r\n').length - 1;
  const unixBreaks = text.split('\n').length - 1 - windowsBreaks;
  if (windowsBreaks > 0 && unixBreaks > 0) return 'mixed';
  return windowsBreaks > 0 ? 'crlf' : 'lf';
}

export class InMemoryDocumentFiles implements DocumentFilePort {
  private readonly textByKey = new Map<string, string>();
  private readonly modifiedAtByKey = new Map<string, number>();
  private writeCount = 0;
  private readonly unreachableKeys = new Set<string>();
  readonly openedPaths: string[] = [];
  readonly openedEncodings: (string | undefined)[] = [];
  readonly savedSources: SaveSource[] = [];
  readonly savedDocuments: EditedDocumentSave[] = [];
  /** The paths the user picks in the next Save As dialogs, in order; undefined means they cancel. */
  readonly saveAsChoices: (string | undefined)[] = [];

  constructor(textByPath: Readonly<Record<string, string>> = {}) {
    for (const [path, text] of Object.entries(textByPath)) this.write(path, text);
  }

  static locationOf(path: string): DocumentLocation {
    const fileName = path.split(/[\\/]/).at(-1) ?? path;
    return { canonicalKey: path.toLowerCase(), displayPath: path, fileName };
  }

  /** Writes a file as another program would, which also moves its modified time on. */
  write(path: string, text: string): void {
    const { canonicalKey } = InMemoryDocumentFiles.locationOf(path);
    this.writeCount += 1;
    this.textByKey.set(canonicalKey, text);
    this.modifiedAtByKey.set(canonicalKey, this.writeCount);
  }

  textOf(path: string): string | undefined {
    return this.textByKey.get(InMemoryDocumentFiles.locationOf(path).canonicalKey);
  }

  delete(path: string): void {
    this.textByKey.delete(InMemoryDocumentFiles.locationOf(path).canonicalKey);
  }

  makeUnreachable(path: string): void {
    this.unreachableKeys.add(InMemoryDocumentFiles.locationOf(path).canonicalKey);
  }

  open(path: string, encoding?: string): Promise<OpenedDocument> {
    this.openedPaths.push(path);
    this.openedEncodings.push(encoding);
    const location = InMemoryDocumentFiles.locationOf(path);
    if (this.unreachableKeys.has(location.canonicalKey)) {
      return Promise.reject(new DocumentOpenError('unreachable', path));
    }
    const text = this.textByKey.get(location.canonicalKey);
    if (text === undefined) return Promise.reject(new DocumentOpenError('notFound', path));
    return Promise.resolve({
      location,
      text,
      encoding: encoding ?? 'utf-8',
      hasByteOrderMark: false,
      lineEnding: lineEndingOf(text),
      modifiedAtMs: this.modifiedAtByKey.get(location.canonicalKey) ?? 0,
    });
  }

  saveAs(source: SaveSource): Promise<string | undefined> {
    this.savedSources.push(source);
    const chosenPath = this.saveAsChoices.shift();
    if (chosenPath === undefined) return Promise.resolve(undefined);
    const text = source.kind === 'text' ? source.text : this.textByKey.get(source.path.toLowerCase());
    this.write(chosenPath, text ?? '');
    return Promise.resolve(chosenPath);
  }

  save(document: EditedDocumentSave): Promise<number> {
    this.savedDocuments.push(document);
    const { canonicalKey } = InMemoryDocumentFiles.locationOf(document.path);
    const hasChangedOnDisk = this.modifiedAtByKey.get(canonicalKey) !== document.expectedModifiedAtMs;
    if (hasChangedOnDisk && !document.shouldOverwriteChangesOnDisk) {
      return Promise.reject(new DocumentOpenError('changedOnDisk', document.path));
    }
    this.write(document.path, document.text);
    return Promise.resolve(this.modifiedAtByKey.get(canonicalKey) ?? 0);
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
