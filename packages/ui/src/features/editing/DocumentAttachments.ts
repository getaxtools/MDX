import { attachmentFolderFor, imageMarkdown, pastedImageName, type ViewerSession } from '@mdx/core';
import type { MessageKey } from '@mdx/i18n';
import {
  DocumentOpenError,
  isUntitledLocation,
  type AttachmentPort,
  type AttachmentTarget,
  type ChosenPicture,
  type DocumentLocation,
  type DocumentOpenFailure,
  type ImagesDrop,
} from '@mdx/platform';

/** Where links go: the editor of one document, near a point on screen or else at its caret. */
export interface LinkPlace {
  readonly canonicalKey: string;
  readonly point?: { readonly x: number; readonly y: number };
}

export interface AttachmentCallbacks {
  /** Whether the active document is open in the editor, where links can be added. */
  readonly isEditing: () => boolean;
  /** Inserts links into the document named by the place; false when it is no longer the one edited. */
  readonly insertLinks: (links: readonly string[], place: LinkPlace) => boolean;
  readonly notify: (key: MessageKey, values?: Readonly<Record<string, string>>) => void;
  /** An Untitled document must be saved before pictures can be copied next to it. */
  readonly askToSaveFirst: () => void;
}

interface DocumentTarget {
  readonly target: AttachmentTarget;
  readonly location: DocumentLocation;
}

/** Copies dropped, pasted and chosen pictures next to the active document and links them in its editor. */
export class DocumentAttachments {
  private isChoosingPictures = false;

  constructor(
    private readonly session: ViewerSession,
    private readonly attachments: AttachmentPort,
    private readonly callbacks: AttachmentCallbacks,
  ) {}

  start(): () => void {
    return this.attachments.onImagesDropped((drop) => void this.addDroppedPictures(drop));
  }

  async addDroppedPictures({ paths, x, y }: ImagesDrop): Promise<void> {
    const document = this.activeDocumentTarget();
    if (!document) return;
    const links = await Promise.all(
      paths.map((path) => this.linkTo(this.attachments.saveDroppedImage(document.target, path), path)),
    );
    const savedLinks = links.filter((link): link is string => link !== undefined);
    this.insertLinks(savedLinks, document.location, { x, y });
  }

  /**
   * The Image button: lets the user choose picture files, copies them next to the document and links
   * them at its caret. A second press while the dialog is open does nothing.
   */
  async addPictureFiles(filterName: string): Promise<void> {
    if (this.isChoosingPictures) return;
    const document = this.activeDocumentTarget();
    if (!document) return;
    this.isChoosingPictures = true;
    try {
      const chosen = await this.attachments.addPictureFiles(document.target, filterName);
      this.reportFailures(chosen);
      const links = chosen.flatMap((picture) =>
        picture.kind === 'saved' ? [imageMarkdown(picture.relativePath)] : [],
      );
      this.insertLinks(links, document.location);
    } catch {
      this.callbacks.notify('attachments.pictureDialogFailed');
    } finally {
      this.isChoosingPictures = false;
    }
  }

  /** Saves pasted picture bytes and returns the Markdown link to put where the paste was. */
  async pastePicture(bytes: Uint8Array): Promise<string | undefined> {
    const document = this.activeDocumentTarget();
    if (!document) return undefined;
    const name = pastedImageName(document.location.fileName, new Date());
    return this.linkTo(this.attachments.savePastedImage(document.target, { name, bytes }), name);
  }

  private insertLinks(
    links: readonly string[],
    location: DocumentLocation,
    point?: { readonly x: number; readonly y: number },
  ): void {
    if (links.length === 0) return;
    const isInserted = this.callbacks.insertLinks(links, {
      canonicalKey: location.canonicalKey,
      ...(point ? { point } : {}),
    });
    if (!isInserted) this.callbacks.notify('attachments.linksNotAdded', { fileName: location.fileName });
  }

  private reportFailures(chosen: readonly ChosenPicture[]): void {
    for (const picture of chosen) {
      if (picture.kind === 'failed') this.notifyFailure(picture.reason, picture.fileName);
    }
  }

  private notifyFailure(failure: DocumentOpenFailure | undefined, name: string): void {
    const path = fileNameOf(name);
    this.callbacks.notify(failureMessageKey(failure, path), { path });
  }

  private async linkTo(saving: Promise<string>, name: string): Promise<string | undefined> {
    try {
      return imageMarkdown(await saving);
    } catch (error) {
      this.notifyFailure(error instanceof DocumentOpenError ? error.failure : undefined, name);
      return undefined;
    }
  }

  private activeDocumentTarget(): DocumentTarget | undefined {
    const location = this.session.currentState().tabStrip.activeTab()?.location;
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
    const attachmentFolder = attachmentFolderFor(kinds.kinds(), kinds.activeKindId());
    return { target: { documentPath: location.displayPath, attachmentFolder }, location };
  }
}

/** A picture larger than the preview shows has a message of its own; the rest say what went wrong. */
function failureMessageKey(failure: DocumentOpenFailure | undefined, path: string): MessageKey {
  if (failure === undefined) return 'attachments.failed';
  if (failure === 'tooLarge') return 'attachments.tooLarge';
  return new DocumentOpenError(failure, path).messageKey;
}

function fileNameOf(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path;
}
