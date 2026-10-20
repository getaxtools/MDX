import type { DocumentLocation } from './DocumentLocation';

export type LineEnding = 'lf' | 'crlf' | 'mixed';

export type PathStatus = 'available' | 'missing' | 'unreachable' | 'cloudOnly';

export interface OpenedDocument {
  readonly location: DocumentLocation;
  readonly text: string;
  readonly encoding: string;
  readonly hasByteOrderMark: boolean;
  /** Some bytes did not fit the encoding and show as U+FFFD; saving over the file would lose them. */
  readonly hasDecodingErrors?: boolean;
  readonly lineEnding: LineEnding;
  readonly modifiedAtMs: number;
}

/** What Save As writes: a copy of an open document, or the text of a document not saved yet. */
export type SaveSource =
  | { readonly kind: 'copy'; readonly path: string }
  | { readonly kind: 'text'; readonly text: string; readonly fileName: string };

/** Edited text to write over an open document, with the encoding and file time it was opened with. */
export interface EditedDocumentSave {
  readonly path: string;
  readonly text: string;
  readonly encoding: string;
  readonly hasByteOrderMark: boolean;
  readonly expectedModifiedAtMs: number;
  readonly shouldOverwriteChangesOnDisk: boolean;
}

export interface DocumentFilePort {
  /** Reads a document, decoded with `encoding` (a WHATWG label) when given, or else detected. */
  open(path: string, encoding?: string): Promise<OpenedDocument>;
  /** Asks the user where to save; resolves to the saved path, or undefined when they cancel. */
  saveAs(source: SaveSource): Promise<string | undefined>;
  /**
   * Writes edited text over its document and resolves to the file's new modified time; rejects with
   * `changedOnDisk` when another program changed the file, unless told to overwrite.
   */
  save(document: EditedDocumentSave): Promise<number>;
  checkPathStatuses(locations: readonly DocumentLocation[]): Promise<ReadonlyMap<string, PathStatus>>;
}
