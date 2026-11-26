import { wikiLinkTargetFor, type NoteEntry } from '@mdx/core';
import type { WikiLinkHeading, WikiLinkNote, WikiLinkSuggester } from '@mdx/editor';
import type { NoteSuggestion, NotesIndexPort } from '@mdx/platform';

export interface NoteLinkSources {
  readonly notesIndex: NotesIndexPort;
  readonly locationId: string;
  /** The note being edited, by its path inside the location. */
  readonly fromNote: string;
  /** The location's notes, to tell whether a name means the suggested note from the edited one. */
  readonly notes: () => readonly NoteEntry[] | undefined;
}

/** Wiki-link suggestions from the index of the shown Notes workspace; an index not ready offers none. */
export function noteLinkSuggester(sources: NoteLinkSources): WikiLinkSuggester {
  const { notesIndex, locationId, fromNote } = sources;
  return {
    notes: async (typed) => {
      const suggestions = await notesIndex.suggestions(locationId, typed, fromNote).catch(() => []);
      const notes = sources.notes();
      return suggestions.flatMap((suggestion) => linkNoteFor(suggestion, fromNote, notes));
    },
    headings: (target): Promise<readonly WikiLinkHeading[]> =>
      notesIndex.headings(locationId, target, fromNote).catch(() => []),
  };
}

function linkNoteFor(
  suggestion: NoteSuggestion,
  fromNote: string,
  notes: readonly NoteEntry[] | undefined,
): WikiLinkNote[] {
  const target = notes ? wikiLinkTargetFor(suggestion.path, fromNote, notes) : suggestion.name;
  if (target === undefined) return [];
  const folder = suggestion.path.split('/').slice(0, -1).join('/');
  return [{ name: suggestion.name, target, folder, alias: suggestion.alias }];
}
