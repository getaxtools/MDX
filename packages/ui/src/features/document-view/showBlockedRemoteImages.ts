import type { Translator } from '@mdx/i18n';

export const BLOCKED_REMOTE_IMAGE_CLASS = 'blocked-remote-image';

/** Shows a note where the renderer left out a remote image, so the reader knows why it is missing. */
export function showBlockedRemoteImages(article: HTMLElement, translator: Translator): void {
  for (const note of article.querySelectorAll(`.${BLOCKED_REMOTE_IMAGE_CLASS}`)) note.remove();
  for (const image of article.querySelectorAll<HTMLImageElement>('img[data-mdx-blocked-src]')) {
    image.after(blockedImageNote(image, translator));
  }
}

function blockedImageNote(image: HTMLImageElement, translator: Translator): HTMLElement {
  const note = image.ownerDocument.createElement('span');
  note.className = BLOCKED_REMOTE_IMAGE_CLASS;
  if (image.alt) note.append(textLine(image.ownerDocument, 'blocked-remote-image-alt', image.alt));
  const url = image.dataset.mdxBlockedSrc ?? '';
  note.append(
    textLine(
      image.ownerDocument,
      'blocked-remote-image-reason',
      translator.translate('document.remoteImageBlocked', { url }),
    ),
  );
  return note;
}

function textLine(document: Document, className: string, text: string): HTMLElement {
  const line = document.createElement('span');
  line.className = className;
  line.textContent = text;
  return line;
}
