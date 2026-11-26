export interface DocumentLink {
  /** `unresolvedNote` is a wiki-link to a note that does not exist yet; its href is the link's target. */
  readonly kind: 'document' | 'external' | 'unresolvedNote';
  readonly href: string;
}
