import { parseWikiLink, resolveWikiLink, type NoteEntry } from '@mdx/core';
import type { EmbedResolver } from '@mdx/editor';
import type { Translator } from '@mdx/i18n';

/** A line that is only `![[Note]]`, `![[Folder/Note#Heading]]` or `![[Note|text]]`. */
const EMBED_LINE = /^!\[\[([^\]\n]+)\]\]$/;

export interface NoteEmbedSources {
  /** The notes folder, as the window shows its path. */
  readonly location: string;
  /** The note that embeds, by its path in the location. */
  readonly fromNote: string;
  readonly notes: readonly NoteEntry[];
  /** Paths in the location, with forward slashes, whose notes are never shown elsewhere. */
  readonly excludedPaths: readonly string[];
  readonly readNote: (path: string) => Promise<string>;
  readonly openNote: (path: string) => void;
  /** A target that names no note, which may then be created. */
  readonly offerNote: (target: string) => void;
  readonly translator: Translator;
}

function isExcluded(notePath: string, excludedPaths: readonly string[]): boolean {
  const path = notePath.toLowerCase();
  return excludedPaths.some((excluded) => {
    const folder = excluded.toLowerCase().replace(/\/+$/, '');
    return path === folder || path.startsWith(`${folder}/`);
  });
}

/**
 * Embeds of a Notes workspace: a line `![[Note]]` shows that note, found the way its wiki-link would
 * be. One level only, since the embedded note is rendered like the preview, which shows no embeds;
 * a note under an excluded path is not shown, so it counts as not found.
 */
export function noteEmbedResolver(sources: NoteEmbedSources): EmbedResolver {
  const { location, fromNote, notes, excludedPaths, translator } = sources;
  const noteFor = (target: string) => {
    const note = resolveWikiLink(target, fromNote, notes);
    return note && !isExcluded(note.path, excludedPaths) ? note : undefined;
  };
  const fullPathOf = (notePath: string) => `${location}\\${notePath.replaceAll('/', '\\')}`;
  return {
    targetOf: (source) => {
      const inner = EMBED_LINE.exec(source.trim())?.[1];
      return inner === undefined ? undefined : parseWikiLink(inner)?.target;
    },
    resolve: async (target) => {
      const note = noteFor(target);
      if (!note) return undefined;
      try {
        return await sources.readNote(fullPathOf(note.path));
      } catch {
        return undefined;
      }
    },
    open: (target) => {
      const note = noteFor(target);
      if (note) sources.openNote(fullPathOf(note.path));
      else sources.offerNote(target);
    },
    labels: {
      region: (target) => translator.translate('editor.richText.embed', { target }),
      notFound: (target) => translator.translate('editor.richText.embedNotFound', { target }),
    },
  };
}
