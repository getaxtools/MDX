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

export interface DocumentFilePort {
  open(path: string): Promise<OpenedDocument>;
  checkPathStatuses(locations: readonly DocumentLocation[]): Promise<ReadonlyMap<string, PathStatus>>;
}
