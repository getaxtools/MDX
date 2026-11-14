/** `[[Folder/Note#Heading|shown text]]` taken apart. */
export interface WikiLink {
  /** The note name or path, without `.md`. */
  readonly target: string;
  readonly heading?: string;
  /** The text to show; the target when the link has none. */
  readonly text: string;
}

/** A note of a Notes location, by its path inside the location with forward slashes. */
export interface NoteEntry {
  readonly path: string;
  readonly aliases?: readonly string[];
}

const MARKDOWN_EXTENSION = /\.(md|markdown)$/i;

export function parseWikiLink(inner: string): WikiLink | undefined {
  const [destination, shownText] = splitOnce(inner, '|');
  const [target, heading] = splitOnce(destination, '#');
  const cleanTarget = target.trim().replace(MARKDOWN_EXTENSION, '');
  if (cleanTarget === '' && heading === undefined) return undefined;
  const ownText = shownText?.trim() ?? '';
  const text = ownText === '' ? [cleanTarget, heading?.trim()].filter(Boolean).join(' > ') : ownText;
  return { target: cleanTarget, text, ...(heading?.trim() ? { heading: heading.trim() } : {}) };
}

/**
 * Finds the note a wiki-link points to: by name or alias ignoring case, or by the end of its path;
 * when several match, the one nearest to the linking note wins, then the shortest path.
 */
export function resolveWikiLink(
  target: string,
  fromNotePath: string,
  notes: readonly NoteEntry[],
): NoteEntry | undefined {
  const wanted = target.toLowerCase();
  const candidates = notes.filter((note) => matchesTarget(note, wanted));
  const fromFolder = folderOf(fromNotePath);
  return candidates.sort(
    (first, second) =>
      sharedDepth(folderOf(second.path), fromFolder) - sharedDepth(folderOf(first.path), fromFolder) ||
      first.path.split('/').length - second.path.split('/').length ||
      first.path.localeCompare(second.path),
  )[0];
}

function matchesTarget(note: NoteEntry, wanted: string): boolean {
  const path = note.path.replace(MARKDOWN_EXTENSION, '').toLowerCase();
  const name = path.split('/').at(-1) ?? path;
  if (wanted.includes('/')) return path === wanted || path.endsWith(`/${wanted}`);
  return name === wanted || (note.aliases ?? []).some((alias) => alias.toLowerCase() === wanted);
}

function folderOf(path: string): readonly string[] {
  return path.split('/').slice(0, -1);
}

function sharedDepth(first: readonly string[], second: readonly string[]): number {
  let depth = 0;
  while (depth < first.length && depth < second.length && first[depth] === second[depth]) depth += 1;
  return depth;
}

function splitOnce(text: string, separator: string): [string, string | undefined] {
  const index = text.indexOf(separator);
  return index === -1 ? [text, undefined] : [text.slice(0, index), text.slice(index + 1)];
}
