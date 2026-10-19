import type { DocumentLocation } from './DocumentLocation';

export type LineEnding = 'lf' | 'crlf' | 'mixed';

export type PathStatus = 'available' | 'missing' | 'unreachable' | 'cloudOnly';

export interface OpenedDocument {
  readonly location: DocumentLocation;
  readonly text: string;
  readonly encoding: string;
  readonly hasByteOrderMark: boolean;
  readonly lineEnding: LineEnding;
  readonly modifiedAtMs: number;
}

/** What Save As writes: a copy of an open document, or the text of a document not saved yet. */
export type SaveSource =
  | { readonly kind: 'copy'; readonly path: string }
  | { readonly kind: 'text'; readonly text: string; readonly fileName: string };

export interface DocumentFilePort {
  /** Reads a document, decoded with `encoding` (a WHATWG label) when given, or else detected. */
  open(path: string, encoding?: string): Promise<OpenedDocument>;
  /** Asks the user where to save; resolves to the saved path, or undefined when they cancel. */
  saveAs(source: SaveSource): Promise<string | undefined>;
  checkPathStatuses(locations: readonly DocumentLocation[]): Promise<ReadonlyMap<string, PathStatus>>;
}
