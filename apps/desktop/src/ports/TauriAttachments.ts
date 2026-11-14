import { listen } from '@tauri-apps/api/event';
import type { AttachmentPort, AttachmentTarget, ImagesDropListener, ImagesDrop } from '@mdx/platform';
import { documentOpenErrorOf } from './documentOpenErrorOf';
import { IMAGES_DROPPED_EVENT, tauriCommands } from './tauriCommands';

export class TauriAttachments implements AttachmentPort {
  async saveDroppedImage(target: AttachmentTarget, path: string): Promise<string> {
    try {
      const saved = await tauriCommands.saveAttachment({
        ...target,
        suggestedName: path.split(/[\\/]/).at(-1) ?? path,
        source: { kind: 'droppedFile', path },
      });
      return saved.relativePath;
    } catch (error) {
      throw documentOpenErrorOf(error, path);
    }
  }

  async savePastedImage(
    target: AttachmentTarget,
    picture: { name: string; bytes: Uint8Array },
  ): Promise<string> {
    try {
      const saved = await tauriCommands.saveAttachment({
        ...target,
        suggestedName: picture.name,
        source: { kind: 'pastedBytes', bytes: [...picture.bytes] },
      });
      return saved.relativePath;
    } catch (error) {
      throw documentOpenErrorOf(error, picture.name);
    }
  }

  onImagesDropped(listener: ImagesDropListener): () => void {
    const stopListening = listen<ImagesDrop>(IMAGES_DROPPED_EVENT, (event) => listener(event.payload));
    return () => void stopListening.then((unlisten) => unlisten());
  }
}
