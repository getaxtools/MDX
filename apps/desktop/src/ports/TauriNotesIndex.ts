import { listen } from '@tauri-apps/api/event';
import type {
  Backlink,
  NoteChanges,
  NoteHeading,
  NoteSearchResults,
  NoteSuggestion,
  NotesIndexPort,
  NotesIndexStatus,
  ShownNotesIndex,
  TagCount,
} from '@mdx/platform';
import { NOTES_INDEX_CHANGES_EVENT, NOTES_INDEX_STATUS_EVENT, tauriCommands } from './tauriCommands';

export class TauriNotesIndex implements NotesIndexPort {
  async showIndex(shown: ShownNotesIndex): Promise<void> {
    await tauriCommands.showNotesIndex(shown);
  }

  async clearAll(): Promise<void> {
    await tauriCommands.clearNotesIndexes();
  }

  async hideIndex(): Promise<void> {
    await tauriCommands.hideNotesIndex();
  }

  search(locationId: string, query: string): Promise<NoteSearchResults> {
    return tauriCommands.searchNotes(locationId, query);
  }

  onIndexStatus(listener: (status: NotesIndexStatus) => void): () => void {
    const stopListening = listen<NotesIndexStatus>(NOTES_INDEX_STATUS_EVENT, (event) =>
      listener(event.payload),
    );
    return () => void stopListening.then((unlisten) => unlisten());
  }

  backlinks(locationId: string, notePath: string): Promise<Backlink[]> {
    return tauriCommands.noteBacklinks(locationId, notePath);
  }

  tags(locationId: string): Promise<TagCount[]> {
    return tauriCommands.noteTags(locationId);
  }

  headings(locationId: string, target: string, fromNote: string): Promise<NoteHeading[]> {
    return tauriCommands.noteHeadings(locationId, target, fromNote);
  }

  suggestions(locationId: string, typed: string, fromNote: string): Promise<NoteSuggestion[]> {
    return tauriCommands.noteSuggestions(locationId, typed, fromNote);
  }

  async refreshIndex(locationId: string): Promise<void> {
    await tauriCommands.refreshNotesIndex(locationId);
  }

  onNotesChanged(listener: (changes: NoteChanges) => void): () => void {
    const stopListening = listen<NoteChanges>(NOTES_INDEX_CHANGES_EVENT, (event) => listener(event.payload));
    return () => void stopListening.then((unlisten) => unlisten());
  }
}
