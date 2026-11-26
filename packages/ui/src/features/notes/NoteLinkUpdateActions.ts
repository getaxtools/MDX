import {
  isNoteOrChildAmong,
  noteNameOf,
  notePathInLocation,
  notesLocationOf,
  notesSettingsOf,
  type MovedNote,
  type ViewerSession,
} from '@mdx/core';
import type { MessageKey, Translator } from '@mdx/i18n';
import {
  DocumentOpenError,
  type AppliedLinkUpdates,
  type ChangedLine,
  type DocumentLocation,
  type LinkUpdatePlan,
  type NoteFilesPort,
  type NoteLinkEdits,
  type NoteLinkUpdates,
  type NotesIndexPort,
  type NotUpdatedReason,
} from '@mdx/platform';
import type { NoticeAction } from '../viewer/ViewerController';

export type NoteLinkUpdateCommand =
  | { readonly kind: 'applyNoteLinkUpdates'; readonly isAlwaysApplied: boolean }
  | { readonly kind: 'skipNoteLinkUpdates' }
  | { readonly kind: 'undoNoteLinkUpdates'; readonly updateNumber: number };

export const NOTE_LINK_UPDATE_COMMAND_KINDS: readonly NoteLinkUpdateCommand['kind'][] = [
  'applyNoteLinkUpdates',
  'skipNoteLinkUpdates',
  'undoNoteLinkUpdates',
];

/** The preview shows at most this many changed lines; every planned line still changes. */
export const MAX_PREVIEW_LINES = 200;

/** A note whose links would change, with the changed lines the preview shows. */
export interface PreviewedNote {
  readonly path: string;
  readonly name: string;
  /** The folder inside the location, with `/` between its parts; empty at the top. */
  readonly folder: string;
  readonly lines: readonly ChangedLine[];
}

/** Why a note linking to the moved note keeps some or all of its links as they are. */
export type LeftNoteReason = NotUpdatedReason | 'unsaved';

export interface LeftNote {
  readonly path: string;
  readonly name: string;
  readonly folder: string;
  readonly reason: LeftNoteReason;
}

/** The link updates a rename or move would make, shown before they are made. */
export interface NoteLinkUpdatePreview {
  /** The moved note's name now. */
  readonly noteName: string;
  readonly linkCount: number;
  readonly noteCount: number;
  readonly notes: readonly PreviewedNote[];
  /** Changed lines left out of the preview to keep it short. */
  readonly hiddenLineCount: number;
  readonly leftNotes: readonly LeftNote[];
  /** The index was still being built, so some links may not have been found. */
  readonly mayMissLinks: boolean;
  /** Notes under the excluded paths are never read, so their links stay as they are. */
  readonly hasExcludedPaths: boolean;
}

interface PendingUpdate {
  readonly location: string;
  readonly moved: MovedNote;
  readonly updates: readonly NoteLinkEdits[];
  readonly preview: NoteLinkUpdatePreview;
}

/** The latest update, kept until its Undo has both moved the note back and restored the links. */
interface DoneUpdate {
  readonly number: number;
  readonly location: string;
  readonly moved: MovedNote;
  readonly undo: readonly NoteLinkEdits[];
  /** Where the note is once Undo moved it back, so a second try only restores the links. */
  readonly movedBackTo?: DocumentLocation;
}

export interface NoteLinkUpdateActionsDependencies {
  readonly session: ViewerSession;
  readonly noteFiles: NoteFilesPort;
  readonly notesIndex?: NotesIndexPort;
  readonly translator: Translator;
  readonly unsavedKeys: () => ReadonlySet<string>;
  /** Whether the index of the shown notes has been built since it was shown. */
  readonly isIndexComplete: () => boolean;
  readonly showNotice: (
    key: MessageKey,
    values?: Readonly<Record<string, string | number>>,
    actions?: readonly NoticeAction[],
  ) => void;
  readonly showLinkUpdatesDialog: () => void;
  readonly closeLinkUpdatesDialog: () => void;
  /** Notes changed on disk, so shown folders and wiki-links are read again. */
  readonly onNotesChanged: () => void;
}

/**
 * After a note is renamed or moved, the links to it in other notes follow it: the changes are shown
 * first unless the user chose to always make them, and one Undo puts the name and the links back.
 */
export class NoteLinkUpdateActions {
  private pending: PendingUpdate | undefined;
  private lastDone: DoneUpdate | undefined;
  private updateCount = 0;

  constructor(private readonly dependencies: NoteLinkUpdateActionsDependencies) {}

  /** The changes waiting for the user's answer. */
  preview(): NoteLinkUpdatePreview | undefined {
    return this.pending?.preview;
  }

  /** Plans the link updates for a note that just moved, then asks first or makes them at once. */
  async offerAfterMove(moved: MovedNote, location: string): Promise<void> {
    this.pending = undefined;
    const plan = await this.plan(moved, location);
    if (!plan || plan.notes.length + plan.notUpdated.length === 0) return;
    const pending = this.pendingFor(plan, moved, location);
    if (pending.updates.length === 0) {
      this.dependencies.showNotice('notes.linkUpdates.noneUpdated', {
        count: distinctPaths(pending.preview.leftNotes),
      });
      return;
    }
    this.pending = pending;
    if (this.dependencies.session.currentState().viewSettings.isNoteLinkUpdateConfirmed)
      this.dependencies.showLinkUpdatesDialog();
    else await this.applyPending(pending);
  }

  async run(command: NoteLinkUpdateCommand): Promise<void> {
    if (command.kind === 'undoNoteLinkUpdates') {
      await this.undo(command.updateNumber);
      return;
    }
    const pending = this.pending;
    this.pending = undefined;
    this.dependencies.closeLinkUpdatesDialog();
    if (!pending || command.kind === 'skipNoteLinkUpdates') return;
    if (command.isAlwaysApplied)
      this.dependencies.session.updateViewSettings((settings) => ({
        ...settings,
        isNoteLinkUpdateConfirmed: false,
      }));
    await this.applyPending(pending);
  }

  private async plan(moved: MovedNote, location: string): Promise<LinkUpdatePlan | undefined> {
    const { notesIndex, session } = this.dependencies;
    const shown = session.shownWorkspace();
    const notesLocation = shown ? notesLocationOf(shown) : undefined;
    if (!notesIndex || !notesLocation) return undefined;
    const move = {
      from: notePathInLocation(location, moved.from.displayPath),
      to: notePathInLocation(location, moved.to.displayPath),
    };
    return notesIndex.planLinkUpdates(notesLocation.locationId, move).catch(() => undefined);
  }

  /** Notes with unsaved changes keep their links, since their edits are kept apart from the file. */
  private pendingFor(plan: LinkUpdatePlan, moved: MovedNote, location: string): PendingUpdate {
    const isUnsaved = this.isUnsavedIn(location);
    const kept = plan.notes.filter((note) => !isUnsaved(note.path));
    const leftNotes = [
      ...plan.notes.filter((note) => isUnsaved(note.path)).map((note) => leftNote(note.path, 'unsaved')),
      ...plan.notUpdated.map((note) => leftNote(note.path, note.reason)),
    ];
    const { notes, hiddenLineCount } = previewedNotes(kept);
    const shown = this.dependencies.session.shownWorkspace();
    return {
      location,
      moved,
      updates: kept.map(editsOf),
      preview: {
        noteName: noteNameOf(moved.to.fileName),
        linkCount: kept.reduce((count, note) => count + note.edits.length, 0),
        noteCount: kept.length,
        notes,
        hiddenLineCount,
        leftNotes,
        mayMissLinks: !this.dependencies.isIndexComplete(),
        hasExcludedPaths: notesSettingsOf(shown).excludedPaths.length > 0,
      },
    };
  }

  /** A note may have been edited while the preview was open, so unsaved notes are checked again. */
  private async applyPending(pending: PendingUpdate): Promise<void> {
    const isUnsaved = this.isUnsavedIn(pending.location);
    const updates = pending.updates.filter((note) => !isUnsaved(note.path));
    const newlyUnsaved = pending.updates
      .filter((note) => isUnsaved(note.path))
      .map((note) => leftNote(note.path, 'unsaved'));
    try {
      const applied = await this.dependencies.noteFiles.applyLinkUpdates({
        location: pending.location,
        updates,
      });
      this.dependencies.onNotesChanged();
      this.updateCount += 1;
      this.lastDone = {
        number: this.updateCount,
        location: pending.location,
        moved: pending.moved,
        undo: applied.undo,
      };
      this.showApplied(
        applied,
        [...pending.preview.leftNotes, ...newlyUnsaved],
        pending.preview.mayMissLinks,
      );
    } catch (error) {
      this.showRefusal(error, pending.preview.noteName);
    }
  }

  private showApplied(
    applied: AppliedLinkUpdates,
    leftBeforehand: readonly LeftNote[],
    mayMissLinks: boolean,
  ): void {
    const notUpdated = distinctPaths([...leftBeforehand, ...applied.notUpdated]);
    if (applied.updatedNotes === 0) {
      this.dependencies.showNotice('notes.linkUpdates.noneUpdated', { count: notUpdated });
      return;
    }
    const values = {
      links: applied.updatedLinks,
      notes: applied.updatedNotes,
      notUpdated,
      indexing: mayMissLinks ? 'yes' : 'no',
    };
    const key = notUpdated > 0 ? 'notes.linkUpdates.updatedSome' : 'notes.linkUpdates.updated';
    this.dependencies.showNotice(key, values, [this.undoAction('notes.linkUpdates.undo')]);
  }

  /**
   * Moves the note back first, so the undo edits find each note where they expect it. The update is
   * forgotten only once both steps worked; until then the notice offers to try again.
   */
  private async undo(updateNumber: number): Promise<void> {
    const done = this.lastDone;
    if (done?.number !== updateNumber) return;
    const back = done.movedBackTo ?? (await this.moveBack(done));
    if (!back) return;
    const isUnsaved = this.isUnsavedIn(done.location);
    const updates = done.undo.filter((note) => !isUnsaved(note.path));
    try {
      const undone = await this.dependencies.noteFiles.applyLinkUpdates({ location: done.location, updates });
      this.lastDone = undefined;
      this.dependencies.onNotesChanged();
      const left = done.undo.length - undone.updatedNotes;
      const key = left > 0 ? 'notes.linkUpdates.undonePartly' : 'notes.linkUpdates.undone';
      this.dependencies.showNotice(key, { name: noteNameOf(back.fileName), count: left });
    } catch {
      this.dependencies.showNotice('notes.linkUpdates.undoLinksFailed', { name: noteNameOf(back.fileName) }, [
        this.undoAction('notes.linkUpdates.tryAgain'),
      ]);
    }
  }

  /** The note at its old place, or undefined when it cannot go back yet; the notice says why. */
  private async moveBack(done: DoneUpdate): Promise<DocumentLocation | undefined> {
    const name = noteNameOf(done.moved.to.fileName);
    const undo = this.undoAction('notes.linkUpdates.undo');
    if (isNoteOrChildAmong(done.moved.to, this.dependencies.unsavedKeys())) {
      this.dependencies.showNotice('notes.tree.saveFirst', { name }, [undo]);
      return undefined;
    }
    try {
      const back = await this.movedBack(done);
      this.dependencies.session.followMovedNote({ from: done.moved.to, to: back });
      this.lastDone = { ...done, movedBackTo: back };
      return back;
    } catch (error) {
      this.showRefusal(error, name, [undo]);
      return undefined;
    }
  }

  private movedBack({ location, moved }: DoneUpdate): Promise<DocumentLocation> {
    const { noteFiles } = this.dependencies;
    const fromFolder = folderOf(moved.from);
    const note = moved.to.displayPath;
    if (fromFolder.toLowerCase() === folderOf(moved.to).toLowerCase())
      return noteFiles.renameNote({ location, note, name: noteNameOf(moved.from.fileName) });
    return noteFiles.moveNote({ location, note, into: fromFolder });
  }

  private undoAction(labelKey: MessageKey): NoticeAction {
    return {
      label: this.dependencies.translator.translate(labelKey),
      command: { kind: 'undoNoteLinkUpdates', updateNumber: this.lastDone?.number ?? this.updateCount },
    };
  }

  private isUnsavedIn(location: string): (path: string) => boolean {
    const unsaved = this.dependencies.unsavedKeys();
    return (path) => unsaved.has(`${location}\\${path.replaceAll('/', '\\')}`.toLowerCase());
  }

  private showRefusal(error: unknown, name: string, actions: readonly NoticeAction[] = []): void {
    const key = error instanceof DocumentOpenError ? error.messageKey : 'errors.document.unreadable';
    this.dependencies.showNotice(key, { path: name }, actions);
  }
}

function editsOf({ path, pathOnceUndone, contentHash, edits }: NoteLinkUpdates): NoteLinkEdits {
  return { path, pathOnceUndone, contentHash, edits };
}

/** The notes as the preview shows them, with no more than `MAX_PREVIEW_LINES` lines in all. */
function previewedNotes(notes: readonly NoteLinkUpdates[]): {
  readonly notes: readonly PreviewedNote[];
  readonly hiddenLineCount: number;
} {
  const previewed: PreviewedNote[] = [];
  let shownLines = 0;
  let hiddenLineCount = 0;
  for (const note of notes) {
    const lines = note.lines.slice(0, Math.max(0, MAX_PREVIEW_LINES - shownLines));
    shownLines += lines.length;
    hiddenLineCount += note.lines.length - lines.length;
    if (lines.length > 0) previewed.push({ ...placeOf(note.path), lines });
  }
  return { notes: previewed, hiddenLineCount };
}

function placeOf(path: string): { readonly path: string; readonly name: string; readonly folder: string } {
  const parts = path.split('/');
  return { path, name: noteNameOf(parts.at(-1) ?? path), folder: parts.slice(0, -1).join('/') };
}

function leftNote(path: string, reason: LeftNoteReason): LeftNote {
  return { ...placeOf(path), reason };
}

function distinctPaths(notes: readonly { readonly path: string }[]): number {
  return new Set(notes.map((note) => note.path)).size;
}

function folderOf(note: DocumentLocation): string {
  return note.displayPath.slice(0, -note.fileName.length - 1);
}
