export interface DocumentLinksPort {
  /** Resolves a relative link in a document, such as `../intro.md`, to the linked document's path. */
  resolveDocumentLink(documentPath: string, href: string): Promise<string>;
  /** Opens a web or mail link in the user's default program. */
  openExternalLink(url: string): Promise<void>;
}
