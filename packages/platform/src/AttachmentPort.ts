/** Pictures dropped on the window, with where they were dropped in CSS pixels. */
export interface ImagesDrop {
  readonly paths: readonly string[];
  readonly x: number;
  readonly y: number;
}

export type ImagesDropListener = (drop: ImagesDrop) => void;

/** Where a picture goes: a folder below the document's folder, such as `assets`. */
export interface AttachmentTarget {
  readonly documentPath: string;
  readonly attachmentFolder: string;
}

export interface AttachmentPort {
  /** Copies a dropped picture next to the document; resolves to its path relative to the document. */
  saveDroppedImage(target: AttachmentTarget, path: string): Promise<string>;
  /** Saves pasted picture bytes next to the document under a suggested name. */
  savePastedImage(target: AttachmentTarget, picture: { name: string; bytes: Uint8Array }): Promise<string>;
  onImagesDropped(listener: ImagesDropListener): () => void;
}
