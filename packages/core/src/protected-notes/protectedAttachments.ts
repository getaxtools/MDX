import type { ProtectedNoteSummary } from '@mdx/platform';

/** The section folder protected pictures are listed in, as plain notes keep theirs in `Attachments`. */
export const PROTECTED_ATTACHMENT_FOLDER = 'Attachments';

const MEDIA_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

function folderParts(folder: string): string[] {
  return folder.split('/').filter((part) => part !== '');
}

/** The path from a protected note's folder to an attachment, such as `../Attachments/chart.png`. */
export function protectedAttachmentPath(noteFolder: string, fileName: string): string {
  return `${'../'.repeat(folderParts(noteFolder).length)}${PROTECTED_ATTACHMENT_FOLDER}/${fileName}`;
}

function decodedLinkTarget(source: string): string | undefined {
  try {
    return decodeURIComponent(source.split(/[?#]/)[0] ?? '');
  } catch {
    return undefined;
  }
}

/** The folder and file name a relative picture link of a protected note points at, if it stays in the section. */
function linkedFile(noteFolder: string, source: string): { folder: string; fileName: string } | undefined {
  const target = decodedLinkTarget(source);
  if (target === undefined || target.startsWith('/') || target.includes(':')) return undefined;
  const linkParts = target.replaceAll('\\', '/').split('/');
  const fileName = linkParts.pop() ?? '';
  const folder = folderFollowing(folderParts(noteFolder), linkParts);
  return fileName === '' || folder === undefined ? undefined : { folder, fileName };
}

/** The folder reached from `start` by a link's folder parts, or none when `..` goes above the section. */
function folderFollowing(start: readonly string[], linkParts: readonly string[]): string | undefined {
  const parts = [...start];
  for (const part of linkParts) {
    if (part === '..') {
      if (parts.pop() === undefined) return undefined;
    } else if (part !== '.' && part !== '') parts.push(part);
  }
  return parts.join('/');
}

/**
 * The attachment a picture link in a protected note shows, by its id; names are compared without
 * case, as the section gives them out. A link that leaves the section or names no attachment shows
 * nothing.
 */
export function protectedAttachmentFor(
  listed: readonly ProtectedNoteSummary[],
  noteFolder: string,
  source: string,
): string | undefined {
  const linked = linkedFile(noteFolder, source);
  if (linked === undefined) return undefined;
  return listed.find(
    (note) =>
      note.kind === 'attachment' &&
      note.folder === linked.folder &&
      note.title.toLowerCase() === linked.fileName.toLowerCase(),
  )?.noteId;
}

/** The media type the section gave an attachment, by the extension it named it with. */
export function protectedAttachmentMediaType(fileName: string): string | undefined {
  const extension = fileName.split('.').at(-1)?.toLowerCase() ?? '';
  return MEDIA_TYPES[extension];
}
