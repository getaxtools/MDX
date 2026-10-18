export interface DocumentResourcesPort {
  /** The URL that shows an image referenced by a document, such as `images/diagram.png`. */
  imageUrl(documentPath: string, source: string): string;
}
