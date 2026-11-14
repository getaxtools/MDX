import type { AttachmentPort, AttachmentTarget, ImagesDrop, ImagesDropListener } from '../AttachmentPort';
import { DocumentOpenError } from '../DocumentOpenError';

export interface SavedAttachmentRecord {
  readonly target: AttachmentTarget;
  readonly fileName: string;
  readonly bytes?: Uint8Array;
}

/** Records saved pictures; a name in `refusedNames` is refused as not a picture. */
export class InMemoryAttachments implements AttachmentPort {
  readonly saved: SavedAttachmentRecord[] = [];
  readonly refusedNames = new Set<string>();
  private readonly listeners = new Set<ImagesDropListener>();

  saveDroppedImage(target: AttachmentTarget, path: string): Promise<string> {
    return this.save(target, fileNameOf(path));
  }

  savePastedImage(target: AttachmentTarget, picture: { name: string; bytes: Uint8Array }): Promise<string> {
    return this.save(target, picture.name, picture.bytes);
  }

  onImagesDropped(listener: ImagesDropListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  drop(drop: ImagesDrop): void {
    for (const listener of this.listeners) listener(drop);
  }

  private save(target: AttachmentTarget, fileName: string, bytes?: Uint8Array): Promise<string> {
    if (this.refusedNames.has(fileName)) return Promise.reject(new DocumentOpenError('notAnImage', fileName));
    this.saved.push({ target, fileName, ...(bytes ? { bytes } : {}) });
    return Promise.resolve(`${target.attachmentFolder}/${fileName}`);
  }
}

function fileNameOf(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path;
}
