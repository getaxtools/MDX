import {
  isInsideFolder,
  isNoteOrChildAmong,
  noteAddress,
  noteNameOf,
  notesLocationOf,
  notePathInLocation,
  resolveWikiLink,
  type NoteEntry,
  type ViewerSession,
} from '@mdx/core';
import type { MessageKey, Translator } from '@mdx/i18n';
import {
  DocumentOpenError,
  type DocumentLocation,
  type FolderListing,
  type NoteFilesPort,
  type NotesIndexStatus,
  type TagCount,
  type NoteTrashEntry,
} from '@mdx/platform';
import type { NotesRendering } from '@mdx/renderer';
import type { NoticeAction } from '../viewer/ViewerController';
import { NOTE_TRASH_COMMAND_KINDS, NoteTrashActions, type NoteTrashCommand } from './NoteTrashActions';
import {
  NOTE_TEMPLATE_COMMAND_KINDS,
  NoteTemplateActions,
  type NoteTemplateCommand,
} from './NoteTemplateActions';

export type NotesCommand =
  | { readonly kind: 'createNote'; readonly parent: string; readonly name: string }
  | { readonly kind: 'renameNote'; readonly note: DocumentLocation; readonly name: string }
  | { readonly kind: 'moveNote'; readonly note: DocumentLocation; readonly into: string }
  | NoteTrashCommand
  | NoteTemplateCommand;

const NOTES_COMMAND_KINDS: ReadonlySet<string> = new Set([
  'createNote',
  'renameNote',
  'moveNote',
  ...NOTE_TRASH_COMMAND_KINDS,
  ...NOTE_TEMPLATE_COMMAND_KINDS,
]);
const TEMPLATE_COMMAND_KINDS: ReadonlySet<string> = new Set(NOTE_TEMPLATE_COMMAND_KINDS);
const TRASH_COMMAND_KINDS: ReadonlySet<string> = new Set(NOTE_TRASH_COMMAND_KINDS);

export function isNotesCommand(command: { readonly kind: string }): command is NotesCommand {
  return NOTES_COMMAND_KINDS.has(command.kind);
}

function isTrashCommand(command: NotesCommand): command is NoteTrashCommand {
  return TRASH_COMMAND_KINDS.has(command.kind);
}

function isTemplateCommand(command: NotesCommand): command is NoteTemplateCommand {
  return TEMPLATE_COMMAND_KINDS.has(command.kind);
}

/** The note tree of the shown Notes workspace. */
export interface NotesView {
  readonly locationPath: string;
  /** Goes up after each change made here, so shown folders list their notes again. */
  readonly revision: number;
  /** The deleted notes, once the trash view was shown. */
  readonly trash?: readonly NoteTrashEntry[];
  /** How far the index of the notes is, for search. */
  readonly indexStatus?: NotesIndexStatus;
  /** The tags of the notes with how many notes carry each. */
  readonly tags?: readonly TagCount[];
  /** The names of the templates, once New Note from Template was chosen. */
  readonly templates?: readonly string[];
}

export interface NotesActionsDependencies {
  readonly session: ViewerSession;
  readonly noteFiles: NoteFilesPort;
  readonly translator: Translator;
  readonly unsavedKeys: () => ReadonlySet<string>;
  /** Opens a new note ready for typing. */
  readonly openForEditing: (path: string) => Promise<void>;
  readonly showNotice: (
    key: MessageKey,
    values?: Readonly<Record<string, string | number>>,
    actions?: readonly NoticeAction[],
  ) => void;
  readonly showTrashDialog: () => void;
  readonly showTemplateDialog: () => void;
  readonly now: () => Date;
  readonly openDocument: (path: string) => Promise<void>;
  readonly onChange: () => void;
}

/** Creates, renames, moves and deletes the notes of the shown Notes workspace; open tabs follow. */
export class NotesActions {
  private revision = 0;
  private readonly trash: NoteTrashActions;
  private readonly templates: NoteTemplateActions;
  private noteList:
    | { readonly location: string; readonly revision: number; readonly notes: readonly NoteEntry[] }
    | undefined;

  constructor(private readonly dependencies: NotesActionsDependencies) {
    this.trash = new NoteTrashActions({ ...dependencies, onNotesChanged: () => this.changed() });
    this.templates = new NoteTemplateActions({ ...dependencies, onNotesChanged: () => this.changed() });
  }

  view(): NotesView | undefined {
    const locationPath = this.locationPath();
    if (locationPath === undefined) return undefined;
    const trash = this.trash.shownEntries(locationPath);
    const templates = this.templates.templates();
    return {
      locationPath,
      revision: this.revision,
      ...(trash ? { trash } : {}),
      ...(templates ? { templates } : {}),
    };
  }

  /** Lists the location's notes before one of them is shown, so its wiki-links resolve. */
  async prepareRendering(document: DocumentLocation): Promise<void> {
    const location = this.locationPath();
    if (location === undefined || !isInsideFolder(document.displayPath, location)) return;
    if (this.noteList?.location === location && this.noteList.revision === this.revision) return;
    const revision = this.revision;
    const found = await this.dependencies.noteFiles.findNotes(location);
    const notes = found.map((note) => ({ path: notePathInLocation(location, note.displayPath) }));
    this.noteList = { location, revision, notes };
  }

  /** How a note of the shown workspace renders its wiki-links; undefined for any other document. */
  renderingFor(document: DocumentLocation): NotesRendering | undefined {
    const location = this.locationPath();
    const list = this.noteList;
    if (location === undefined || list?.location !== location) return undefined;
    if (!isInsideFolder(document.displayPath, location)) return undefined;
    const fromNote = notePathInLocation(location, document.displayPath);
    return {
      resolveWikiLink: (target) => {
        const note = resolveWikiLink(target, fromNote, list.notes);
        return note ? noteAddress(fromNote, note.path) : undefined;
      },
      unresolvedDescription: this.dependencies.translator.translate('notes.links.unresolved'),
    };
  }

  /** The shown location's notes as last listed, for telling which note a wiki-link name means. */
  noteEntries(): readonly NoteEntry[] | undefined {
    const list = this.noteList;
    return list && list.location === this.locationPath() ? list.notes : undefined;
  }

  /** Changes whenever the listed notes change, so a shown note renders its links again. */
  noteListVersion(): object | undefined {
    return this.noteList;
  }

  /** Notes may have changed outside the app, so the next note shown lists them again. */
  forgetNoteList(): void {
    this.noteList = undefined;
  }

  /** A link to a note that does not exist yet offers to create it next to the linking note. */
  offerNoteFor(target: string, linkingNote: DocumentLocation): void {
    const name = target.split('/').at(-1)?.trim() ?? '';
    const folder = linkingNote.displayPath.slice(0, -linkingNote.fileName.length - 1);
    if (name === '' || this.locationPath() === undefined) return;
    this.dependencies.showNotice('notes.links.missing', { name }, [
      {
        label: this.dependencies.translator.translate('notes.links.create'),
        command: { kind: 'createNote', parent: folder, name },
      },
    ]);
  }

  listFolder(folderPath: string): Promise<FolderListing> {
    return this.dependencies.noteFiles.listFolder(folderPath);
  }

  async run(command: NotesCommand): Promise<void> {
    const location = this.locationPath();
    if (location === undefined) return;
    if (isTrashCommand(command)) {
      await this.trash.run(command, location);
      return;
    }
    if (isTemplateCommand(command)) {
      await this.templates.run(command, location);
      return;
    }
    if (command.kind === 'createNote') {
      await this.create(location, command.parent, command.name);
      return;
    }
    if (this.isRefusedForUnsavedChanges(command.note)) return;
    const { noteFiles } = this.dependencies;
    const note = command.note.displayPath;
    await this.relocate(command.note, () =>
      command.kind === 'renameNote'
        ? noteFiles.renameNote({ location, note, name: command.name })
        : noteFiles.moveNote({ location, note, into: command.into }),
    );
  }

  private async create(location: string, parent: string, name: string): Promise<void> {
    try {
      const note = await this.dependencies.noteFiles.createNote({ location, parent, name });
      this.changed();
      await this.dependencies.openForEditing(note.displayPath);
    } catch (error) {
      this.showRefusal(error, name);
    }
  }

  private async relocate(note: DocumentLocation, move: () => Promise<DocumentLocation>): Promise<void> {
    try {
      const moved = await move();
      this.dependencies.session.followMovedNote({ from: note, to: moved });
      this.changed();
    } catch (error) {
      this.showRefusal(error, noteNameOf(note.fileName));
    }
  }

  /** Edits are kept by the note's path, so a note with unsaved changes is saved before it moves. */
  private isRefusedForUnsavedChanges(note: DocumentLocation): boolean {
    if (!isNoteOrChildAmong(note, this.dependencies.unsavedKeys())) return false;
    this.dependencies.showNotice('notes.tree.saveFirst', { name: noteNameOf(note.fileName) });
    return true;
  }

  private changed(): void {
    this.revision += 1;
    this.dependencies.onChange();
  }

  private showRefusal(error: unknown, name: string): void {
    const key = error instanceof DocumentOpenError ? error.messageKey : 'errors.document.unreadable';
    this.dependencies.showNotice(key, { path: name });
  }

  private locationPath(): string | undefined {
    const shown = this.dependencies.session.shownWorkspace();
    return shown ? notesLocationOf(shown)?.path : undefined;
  }
}
