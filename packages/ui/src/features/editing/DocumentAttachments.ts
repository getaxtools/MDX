import { attachmentFolderFor, imageMarkdown, pastedImageName, type ViewerSession } from '@mdx/core';
import type { MessageKey } from '@mdx/i18n';
import {
  isUntitledLocation,
  type AttachmentPort,
  type AttachmentTarget,
  type DocumentLocation,
  type ImagesDrop,
} from '@mdx/platform';

export interface AttachmentCallbacks {
  /** Whether the active document is open in the editor, where links can be added. */
  readonly isEditing: () => boolean;
  readonly insertLinks: (links: readonly string[], point: { readonly x: number; readonly y: number }) => void;
  readonly notify: (key: MessageKey, values?: Readonly<Record<string, string>>) => void;
  /** An Untitled document must be saved before pictures can be copied next to it. */
  readonly askToSaveFirst: () => void;
}

/** Copies dropped and pasted pictures next to the active document and links them in the editor. */
export class DocumentAttachments {
  constructor(
    private readonly session: ViewerSession,
    private readonly attachments: AttachmentPort,
    private readonly callbacks: AttachmentCallbacks,
  ) {}

  start(): () => void {
    return this.attachments.onImagesDropped((drop) => void this.addDroppedPictures(drop));
  }

  async addDroppedPictures({ paths, x, y }: ImagesDrop): Promise<void> {
    const target = this.targetForActiveDocument();
    if (!target) return;
    const links = await Promise.all(
      paths.map((path) => this.linkTo(this.attachments.saveDroppedImage(target, path), path)),
    );
    const savedLinks = links.filter((link): link is string => link !== undefined);
    if (savedLinks.length > 0) this.callbacks.insertLinks(savedLinks, { x, y });
  }

  /** Saves pasted picture bytes and returns the Markdown link to put where the paste was. */
  async pastePicture(bytes: Uint8Array): Promise<string | undefined> {
    const target = this.targetForActiveDocument();
    const location = this.activeLocation();
    if (!target || !location) return undefined;
    const name = pastedImageName(location.fileName, new Date());
    return this.linkTo(this.attachments.savePastedImage(target, { name, bytes }), name);
  }

  private async linkTo(saving: Promise<string>, name: string): Promise<string | undefined> {
    try {
      return imageMarkdown(await saving);
    } catch {
      this.callbacks.notify('attachments.failed', { path: fileNameOf(name) });
      return undefined;
    }
  }

  private targetForActiveDocument(): AttachmentTarget | undefined {
    const location = this.activeLocation();
    if (!location) return undefined;
    if (isUntitledLocation(location)) {
      this.callbacks.askToSaveFirst();
      return undefined;
    }
    if (!this.callbacks.isEditing()) {
      this.callbacks.notify('attachments.notEditing');
      return undefined;
    }
    const kinds = this.session.currentState().workspaceKinds;
    return {
      documentPath: location.displayPath,
      attachmentFolder: attachmentFolderFor(kinds.kinds(), kinds.activeKindId()),
    };
  }

  private activeLocation(): DocumentLocation | undefined {
    return this.session.currentState().tabStrip.activeTab()?.location;
  }
}

function fileNameOf(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path;
}
