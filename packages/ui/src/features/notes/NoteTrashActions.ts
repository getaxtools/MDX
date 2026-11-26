import { isNoteOrChildAmong, noteNameOf, type ViewerSession } from '@mdx/core';
import type { MessageKey, Translator } from '@mdx/i18n';
import {
  DocumentOpenError,
  type DocumentLocation,
  type NoteFilesPort,
  type NoteTrashEntry,
} from '@mdx/platform';
import type { NoticeAction } from '../viewer/ViewerController';

export type NoteTrashCommand =
  | { readonly kind: 'deleteNote'; readonly note: DocumentLocation }
  | { readonly kind: 'showNoteTrash' }
  | { readonly kind: 'restoreNote'; readonly entryId: string }
  | { readonly kind: 'emptyNoteTrash' };

export const NOTE_TRASH_COMMAND_KINDS: readonly NoteTrashCommand['kind'][] = [
  'deleteNote',
  'showNoteTrash',
  'restoreNote',
  'emptyNoteTrash',
];

export interface NoteTrashActionsDependencies {
  readonly session: ViewerSession;
  readonly noteFiles: NoteFilesPort;
  readonly translator: Translator;
  readonly unsavedKeys: () => ReadonlySet<string>;
  readonly showNotice: (
    key: MessageKey,
    values?: Readonly<Record<string, string | number>>,
    actions?: readonly NoticeAction[],
  ) => void;
  readonly showTrashDialog: () => void;
  /** The notes changed on disk, so shown folders list them again. */
  readonly onNotesChanged: () => void;
}

/** Deleting notes into the location's trash, and restoring or emptying it from the trash view. */
export class NoteTrashActions {
  private shown: { readonly location: string; readonly entries: readonly NoteTrashEntry[] } | undefined;

  constructor(private readonly dependencies: NoteTrashActionsDependencies) {}

  /** The location's trash as last listed; undefined until its trash view is shown. */
  shownEntries(location: string): readonly NoteTrashEntry[] | undefined {
    return this.shown?.location === location ? this.shown.entries : undefined;
  }

  async run(command: NoteTrashCommand, location: string): Promise<void> {
    if (command.kind === 'deleteNote') await this.delete(command.note, location);
    else if (command.kind === 'showNoteTrash') await this.show(location);
    else if (command.kind === 'restoreNote') await this.restore(command.entryId, location);
    else await this.empty(location);
  }

  private async delete(note: DocumentLocation, location: string): Promise<void> {
    const name = noteNameOf(note.fileName);
    if (isNoteOrChildAmong(note, this.dependencies.unsavedKeys())) {
      this.dependencies.showNotice('notes.trash.saveFirst', { name });
      return;
    }
    try {
      const entry = await this.dependencies.noteFiles.deleteNote({ location, note: note.displayPath });
      this.closeTabsOf(note);
      await this.changed(location);
      this.dependencies.showNotice('notes.trash.moved', { name }, [
        {
          label: this.dependencies.translator.translate('notes.trash.undo'),
          command: { kind: 'restoreNote', entryId: entry.id },
        },
      ]);
    } catch (error) {
      this.showRefusal(error, name);
    }
  }

  private async show(location: string): Promise<void> {
    this.shown = { location, entries: await this.dependencies.noteFiles.listTrash(location) };
    this.dependencies.showTrashDialog();
  }

  private async restore(entryId: string, location: string): Promise<void> {
    try {
      const restored = await this.dependencies.noteFiles.restoreNote({ location, entryId });
      await this.changed(location);
      this.dependencies.showNotice('notes.trash.restored', { name: noteNameOf(restored.fileName) });
    } catch (error) {
      this.showRefusal(error, entryId);
    }
  }

  private async empty(location: string): Promise<void> {
    const count = await this.dependencies.noteFiles.emptyTrash(location);
    await this.changed(location);
    this.dependencies.showNotice('notes.trash.emptied', { count });
  }

  private closeTabsOf(note: DocumentLocation): void {
    this.dependencies.session.updateTabs((tabStrip) =>
      tabStrip
        .tabs()
        .filter((tab) => isNoteOrChildAmong(note, [tab.location.canonicalKey]))
        .reduce((remaining, tab) => remaining.close(tab.location.canonicalKey), tabStrip),
    );
  }

  private async changed(location: string): Promise<void> {
    if (this.shown?.location === location) {
      this.shown = { location, entries: await this.dependencies.noteFiles.listTrash(location) };
    }
    this.dependencies.onNotesChanged();
  }

  private showRefusal(error: unknown, name: string): void {
    const key = error instanceof DocumentOpenError ? error.messageKey : 'errors.document.unreadable';
    this.dependencies.showNotice(key, { path: name });
  }
}
