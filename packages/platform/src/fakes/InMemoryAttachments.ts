import type {
  AttachmentPort,
  AttachmentTarget,
  ChosenPicture,
  ImagesDrop,
  ImagesDropListener,
} from '../AttachmentPort';
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
  /** The files the picture dialog returns; empty, as when it is cancelled, until a test sets them. */
  pictureChoice: readonly string[] = [];
  /** The filter name each picture dialog was shown with. */
  readonly pictureDialogFilters: string[] = [];
  private readonly listeners = new Set<ImagesDropListener>();

  saveDroppedImage(target: AttachmentTarget, path: string): Promise<string> {
    return this.save(target, fileNameOf(path));
  }

  savePastedImage(target: AttachmentTarget, picture: { name: string; bytes: Uint8Array }): Promise<string> {
    return this.save(target, picture.name, picture.bytes);
  }

  /** Copies the pictures named in `pictureChoice`, as if the user had chosen them in the dialog. */
  async addPictureFiles(target: AttachmentTarget, filterName: string): Promise<readonly ChosenPicture[]> {
    this.pictureDialogFilters.push(filterName);
    return Promise.all(
      this.pictureChoice.map((path) =>
        this.save(target, fileNameOf(path)).then(
          (relativePath): ChosenPicture => ({ kind: 'saved', relativePath }),
          (): ChosenPicture => ({ kind: 'failed', fileName: fileNameOf(path), reason: 'notAnImage' }),
        ),
      ),
    );
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
    return Promise.resolve(`${upwardFromNote(target)}${target.attachmentFolder}/${fileName}`);
  }
}

/** `../` for each folder between the notes folder and the note, as the desktop app links. */
function upwardFromNote({ documentPath, notesFolder }: AttachmentTarget): string {
  if (notesFolder === undefined) return '';
  const inside = documentPath.slice(notesFolder.length + 1).split(/[\\/]/);
  return '../'.repeat(Math.max(inside.length - 1, 0));
}

function fileNameOf(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path;
}
