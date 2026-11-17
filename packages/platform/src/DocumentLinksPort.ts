/** Where a link really leads, through any folder links on the way, and whether the app may read it. */
export interface InspectedLink {
  readonly path: string;
  readonly isGranted: boolean;
}

export interface DocumentLinksPort {
  /**
   * Resolves a relative link in a document, such as `../intro.md`, to the linked document's path, and lets
   * the app read its folder. With `expectedTarget`, the link must still lead to that document.
   */
  resolveDocumentLink(documentPath: string, href: string, expectedTarget?: string): Promise<string>;
  /** Where a link leads, without letting the app read anything new, so the window can ask first. */
  inspectDocumentLink(documentPath: string, href: string): Promise<InspectedLink>;
  /** Opens a web or mail link in the user's default program. */
  openExternalLink(url: string): Promise<void>;
}
