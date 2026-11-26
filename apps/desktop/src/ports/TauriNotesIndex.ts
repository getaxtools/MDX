import type {
  Backlink,
  LinkUpdatePlan,
  NoteMoveInLocation,
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
import { listenInThisWindow } from './windowEvents';

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
    return listenInThisWindow<NotesIndexStatus>(NOTES_INDEX_STATUS_EVENT, (event) => listener(event.payload));
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

  planLinkUpdates(locationId: string, moved: NoteMoveInLocation): Promise<LinkUpdatePlan> {
    return tauriCommands.planNoteLinkUpdates(locationId, moved);
  }

  async refreshIndex(locationId: string): Promise<void> {
    await tauriCommands.refreshNotesIndex(locationId);
  }

  onNotesChanged(listener: (changes: NoteChanges) => void): () => void {
    return listenInThisWindow<NoteChanges>(NOTES_INDEX_CHANGES_EVENT, (event) => listener(event.payload));
  }
}
