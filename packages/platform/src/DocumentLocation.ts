export interface DocumentLocation {
  readonly canonicalKey: string;
  readonly displayPath: string;
  readonly fileName: string;
}

export function isSameDocument(first: DocumentLocation, second: DocumentLocation): boolean {
  return first.canonicalKey === second.canonicalKey;
}
