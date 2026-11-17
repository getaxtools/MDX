/** A document link of a Spec viewer workspace that leads outside the granted folders, waiting for an answer. */
export interface OutsideLinkRequest {
  readonly documentPath: string;
  readonly href: string;
  /** Where the link really leads, as the app resolved it; it opens only while the link still leads there. */
  readonly targetPath: string;
}
