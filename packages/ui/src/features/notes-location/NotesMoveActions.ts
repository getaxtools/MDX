import {
  claimedNotesLocations,
  isInsideFolder,
  kindDataWithLocation,
  locationClaimProblem,
  locationMovedInto,
  notesLocationOf,
  type NotesLocation,
  type ViewerSession,
} from '@mdx/core';
import type { MessageKey } from '@mdx/i18n';
import {
  NotesMoveError,
  type DocumentLocation,
  type NotesMovePlan,
  type NotesMovePort,
  type NotesMoveProblem,
  type NotesMoveProgress,
  type OldNotesCopy,
  type UnfinishedNotesMove,
} from '@mdx/platform';
import { moveProblemNotice, type MoveNotice } from './moveProblemNotice';

export type NotesMoveCommand =
  | { readonly kind: 'changeNotesLocation' }
  | { readonly kind: 'startNotesMove' }
  | { readonly kind: 'resumeNotesMove' }
  | { readonly kind: 'stopNotesMove' }
  | { readonly kind: 'cancelNotesMove' }
  | { readonly kind: 'postponeNotesMove' }
  | { readonly kind: 'keepOldNotesCopy' }
  | { readonly kind: 'askToRemoveOldNotesCopy' }
  | { readonly kind: 'removeOldNotesCopy' }
  | { readonly kind: 'stopNotesMoveAndClose' }
  | { readonly kind: 'keepMovingNotes' };

const NOTES_MOVE_COMMAND_KINDS: ReadonlySet<string> = new Set([
  'changeNotesLocation',
  'startNotesMove',
  'resumeNotesMove',
  'stopNotesMove',
  'cancelNotesMove',
  'postponeNotesMove',
  'keepOldNotesCopy',
  'askToRemoveOldNotesCopy',
  'removeOldNotesCopy',
  'stopNotesMoveAndClose',
  'keepMovingNotes',
]);

export function isNotesMoveCommand(command: { readonly kind: string }): command is NotesMoveCommand {
  return NOTES_MOVE_COMMAND_KINDS.has(command.kind);
}

/** The move's dialog: the plan to confirm, an unfinished move, or the offer to remove the old copy. */
export type NotesMoveDialog =
  | { readonly kind: 'plan'; readonly target: string; readonly plan: NotesMovePlan }
  | {
      readonly kind: 'resume';
      readonly source: string;
      readonly target: string;
      readonly problem?: MoveNotice;
    }
  | { readonly kind: 'removalOffer'; readonly target: string; readonly oldCopy: OldNotesCopy }
  | { readonly kind: 'removalConfirmation'; readonly oldCopy: OldNotesCopy }
  | { readonly kind: 'closeDuringMove'; readonly source: string };

/** What the status bar says while the notes are read-only for a move. */
export type NotesMoveStatus =
  | { readonly kind: 'planned' }
  | { readonly kind: 'paused' }
  | { readonly kind: 'copying' | 'verifying'; readonly doneFiles: number; readonly totalFiles: number };

interface ActiveMove {
  readonly workspaceId: string;
  readonly locationId: string;
  readonly source: string;
  readonly target: string;
}

export interface NotesMoveActionsDependencies {
  readonly session: ViewerSession;
  readonly notesMoves: NotesMovePort;
  readonly pickFolder: () => Promise<string | undefined>;
  readonly showNotice: (notice: MoveNotice, actions?: readonly NotesMoveCommand[]) => void;
  /** Open documents in the folder with changes not saved yet, which a move or a removal would lose. */
  readonly hasUnsavedDocumentsIn: (folder: string) => boolean;
  /** The app language, for file sizes in messages. */
  readonly locale: string;
  readonly onChange: () => void;
  /** The workspace now reads its notes from the new folder. */
  readonly onSwitched: () => Promise<void>;
}

/**
 * Change location: plan, copy and verify, switch, then keep or remove the old copy. The notes stay
 * read-only from the plan until the switch or a cancel, and every failure keeps the old folder.
 */
export class NotesMoveActions {
  private active: ActiveMove | undefined;
  private dialog: NotesMoveDialog | undefined;
  private status: NotesMoveStatus | undefined;
  /** The copy that runs now, so closing the window can wait for it to stop. */
  private running: Promise<void> | undefined;
  private answerClosing: ((mayClose: boolean) => void) | undefined;

  constructor(private readonly dependencies: NotesMoveActionsDependencies) {}

  /**
   * Closing the window while files are copied asks first: Stop and Close stops the move safely
   * before the window closes; Keep Moving, the default, keeps the window open.
   */
  confirmClosing(): Promise<boolean> {
    const move = this.active;
    if (!this.running || !move) return Promise.resolve(true);
    this.dialog = { kind: 'closeDuringMove', source: move.source };
    this.dependencies.onChange();
    return new Promise((resolve) => (this.answerClosing = resolve));
  }

  isCopying(): boolean {
    return this.running !== undefined;
  }

  /** Clear All Data forgot every move, so nothing is read-only or offered any more. */
  forgetMoves(): void {
    this.endMove();
  }

  start(): () => void {
    return this.dependencies.notesMoves.onProgress((progress) => this.showProgress(progress));
  }

  dialogShown(): NotesMoveDialog | undefined {
    return this.dialog;
  }

  statusShown(): NotesMoveStatus | undefined {
    return this.status;
  }

  /** Whether a path lies in a notes folder being moved, which may not change until the move ends. */
  isReadOnly(path: string): boolean {
    return this.status !== undefined && this.active !== undefined && isInsideFolder(path, this.active.source);
  }

  async run(command: NotesMoveCommand): Promise<void> {
    const handlers: Readonly<Record<NotesMoveCommand['kind'], () => Promise<void>>> = {
      changeNotesLocation: () => this.planMove(),
      startNotesMove: () => this.runMove(),
      resumeNotesMove: () => this.runMove(),
      stopNotesMove: () => this.dependencies.notesMoves.stopMove(),
      cancelNotesMove: () => this.cancelMove(),
      postponeNotesMove: () => this.postpone(),
      keepOldNotesCopy: () => this.keepOldCopy(),
      askToRemoveOldNotesCopy: () => this.askToRemoveOldCopy(),
      removeOldNotesCopy: () => this.removeOldCopy(),
      stopNotesMoveAndClose: () => this.stopAndClose(),
      keepMovingNotes: () => this.keepMoving(),
    };
    await handlers[command.kind]();
  }

  /** At start: an unfinished move is offered again, and a finished switch offers the old copy. */
  async offerUnfinishedMoves(): Promise<void> {
    const { session, notesMoves } = this.dependencies;
    const workspaces = session.workspaces()?.workspaces() ?? [];
    const moves = await notesMoves.unfinishedMoves();
    const move = moves.find((candidate) => workspaces.some(({ id }) => id === candidate.workspaceId));
    if (!move) return;
    this.active = {
      workspaceId: move.workspaceId,
      locationId: move.locationId,
      source: move.path,
      target: move.target,
    };
    const workspace = workspaces.find(({ id }) => id === move.workspaceId);
    const isOnTarget = workspace !== undefined && isOnFolder(notesLocationOf(workspace), move.target);
    if (move.state === 'switched' || isOnTarget) await this.offerOldCopy();
    else this.offerResume(move);
  }

  private offerResume(move: UnfinishedNotesMove): void {
    this.status = { kind: 'paused' };
    this.dialog = {
      kind: 'resume',
      source: move.path,
      target: move.target,
      ...(move.failure ? { problem: moveProblemNotice(move.failure, this.dependencies.locale) } : {}),
    };
    this.dependencies.onChange();
  }

  private async planMove(): Promise<void> {
    const shown = this.shownMove();
    if (!shown) return;
    if (this.active) {
      this.showUnfinishedMove(this.active);
      return;
    }
    if (this.dependencies.hasUnsavedDocumentsIn(shown.location.path)) {
      this.notify({ key: 'notesLocation.move.unsavedNotes' });
      return;
    }
    const target = await this.pickTarget(shown.location);
    if (target === undefined) return;
    const request = { ...shown.move, target };
    try {
      const plan = await this.dependencies.notesMoves.planMove(request);
      this.active = request;
      this.status = { kind: 'planned' };
      this.dialog = { kind: 'plan', target, plan };
      this.dependencies.onChange();
    } catch (error) {
      this.notifyFailure(error);
    }
  }

  /** Change Location during a paused move offers it again instead of starting another. */
  private showUnfinishedMove(move: ActiveMove): void {
    if (this.status?.kind !== 'paused') {
      this.notify({ key: 'notesLocation.move.problem.moveUnderway' });
      return;
    }
    this.dialog = { kind: 'resume', source: move.source, target: move.target };
    this.dependencies.onChange();
  }

  private async pickTarget(location: NotesLocation): Promise<string | undefined> {
    const picked = await this.dependencies.pickFolder();
    if (picked === undefined) return undefined;
    const { session } = this.dependencies;
    const claimed = claimedNotesLocations(
      session.workspaces()?.workspaces() ?? [],
      session.shownWorkspace()?.id,
    );
    const problem = locationClaimProblem(picked, [...claimed, location.path]);
    if (!problem) return picked;
    this.notify({ key: targetProblemKey(picked, location.path, problem) });
    return undefined;
  }

  private async runMove(): Promise<void> {
    const move = this.active;
    if (!move) return;
    this.dialog = undefined;
    this.status = { kind: 'copying', doneFiles: 0, totalFiles: 0 };
    this.dependencies.onChange();
    this.dependencies.showNotice({ key: 'notesLocation.move.moving', values: { target: move.target } }, [
      { kind: 'stopNotesMove' },
    ]);
    this.running = this.dependencies.notesMoves.runMove(move.locationId);
    try {
      await this.running;
    } catch (error) {
      this.pauseAfter(move, error);
      return;
    } finally {
      this.running = undefined;
    }
    await this.switchTo(move);
  }

  private async stopAndClose(): Promise<void> {
    const running = this.running;
    await this.dependencies.notesMoves.stopMove();
    await running?.catch(() => undefined);
    this.answerClosing?.(true);
    this.answerClosing = undefined;
  }

  private keepMoving(): Promise<void> {
    if (this.dialog?.kind === 'closeDuringMove') this.dialog = undefined;
    this.answerClosing?.(false);
    this.answerClosing = undefined;
    this.dependencies.onChange();
    return Promise.resolve();
  }

  /** The move stopped; the notes stay in the old folder and stay read-only until Resume or Cancel. */
  private pauseAfter(move: ActiveMove, error: unknown): void {
    this.status = { kind: 'paused' };
    const problem = error instanceof NotesMoveError ? error.problem : undefined;
    this.dialog = {
      kind: 'resume',
      source: move.source,
      target: move.target,
      ...(problem ? { problem: moveProblemNotice(problem, this.dependencies.locale) } : {}),
    };
    this.dependencies.showNotice({ key: 'notesLocation.move.paused' });
    this.dependencies.onChange();
  }

  /**
   * Until the workspace record names the new folder, a failure pauses the move; after that the
   * notes are in the new folder, so what remains is the offer of the old copy, never a cancel.
   */
  private async switchTo(move: ActiveMove): Promise<void> {
    let target: DocumentLocation;
    try {
      target = await this.dependencies.notesMoves.switchMove(move.locationId);
      await this.useNewFolder(move, target);
    } catch (error) {
      this.pauseAfter(move, error);
      return;
    }
    this.status = undefined;
    this.notify({ key: 'notesLocation.move.switched', values: { target: target.displayPath } });
    try {
      await this.dependencies.onSwitched();
    } finally {
      await this.offerOldCopy();
    }
  }

  /** One update of the workspace record, then the open tabs and lists follow the notes. */
  private async useNewFolder(move: ActiveMove, target: DocumentLocation): Promise<void> {
    const { session } = this.dependencies;
    const workspace = session
      .workspaces()
      ?.workspaces()
      .find(({ id }) => id === move.workspaceId);
    const previous = workspace ? notesLocationOf(workspace) : undefined;
    if (!workspace || !previous) throw new NotesMoveError({ code: 'noMove' });
    const location = {
      path: target.displayPath,
      canonicalKey: target.canonicalKey,
      locationId: move.locationId,
    };
    await session.updateWorkspaceKindData(
      move.workspaceId,
      kindDataWithLocation(workspace.kindData, location),
    );
    if (session.shownWorkspace()?.id === move.workspaceId) followMovedFolder(session, previous, target);
  }

  private async offerOldCopy(): Promise<void> {
    const move = this.active;
    if (!move) return;
    try {
      const oldCopy = await this.dependencies.notesMoves.finishSwitch(move.locationId);
      this.status = undefined;
      this.dialog = { kind: 'removalOffer', target: move.target, oldCopy };
    } catch (error) {
      this.notifyFailure(error);
    }
    this.dependencies.onChange();
  }

  private async cancelMove(): Promise<void> {
    const move = this.active;
    if (!move) return;
    try {
      const kept = await this.dependencies.notesMoves.cancelMove(move.locationId);
      this.endMove();
      this.notify(
        kept.count === 0
          ? { key: 'notesLocation.move.cancelled', values: { source: move.source } }
          : {
              key: 'notesLocation.move.cancelledKept',
              values: { target: move.target, count: kept.count, paths: kept.paths.join(', ') },
            },
      );
    } catch (error) {
      this.notifyFailure(error);
    }
  }

  private async postpone(): Promise<void> {
    this.dialog = undefined;
    this.dependencies.showNotice({ key: 'notesLocation.move.paused' }, [
      { kind: 'resumeNotesMove' },
      { kind: 'cancelNotesMove' },
    ]);
    this.dependencies.onChange();
    return Promise.resolve();
  }

  private async keepOldCopy(): Promise<void> {
    const oldCopy = this.oldCopyShown();
    if (!oldCopy) return;
    try {
      await this.dependencies.notesMoves.keepOldCopy(oldCopy.locationId);
      this.endMove();
      this.notify({ key: 'notesLocation.move.keptOldCopy', values: { path: oldCopy.path } });
    } catch (error) {
      this.notifyFailure(error);
    }
  }

  private async askToRemoveOldCopy(): Promise<void> {
    const oldCopy = this.oldCopyShown();
    if (!oldCopy) return;
    this.dialog = { kind: 'removalConfirmation', oldCopy };
    this.dependencies.onChange();
    return Promise.resolve();
  }

  private async removeOldCopy(): Promise<void> {
    const oldCopy = this.dialog?.kind === 'removalConfirmation' ? this.dialog.oldCopy : undefined;
    if (!oldCopy) return;
    if (this.dependencies.hasUnsavedDocumentsIn(oldCopy.path)) {
      this.notify({ key: 'notesLocation.move.unsavedOldCopy', values: { path: oldCopy.path } });
      return;
    }
    try {
      const removal = await this.dependencies.notesMoves.removeOldCopy(oldCopy.locationId);
      this.endMove();
      this.notify(removalNotice(oldCopy, removal));
    } catch (error) {
      this.notifyFailure(error);
    }
  }

  private oldCopyShown(): OldNotesCopy | undefined {
    const dialog = this.dialog;
    return dialog?.kind === 'removalOffer' || dialog?.kind === 'removalConfirmation'
      ? dialog.oldCopy
      : undefined;
  }

  private showProgress(progress: NotesMoveProgress): void {
    if (progress.locationId !== this.active?.locationId || this.status?.kind === 'paused') return;
    this.status = { kind: progress.phase, doneFiles: progress.doneFiles, totalFiles: progress.totalFiles };
    this.dependencies.onChange();
  }

  private endMove(): void {
    this.active = undefined;
    this.dialog = undefined;
    this.status = undefined;
    this.dependencies.onChange();
  }

  private shownMove():
    { readonly move: Omit<ActiveMove, 'target'>; readonly location: NotesLocation } | undefined {
    const shown = this.dependencies.session.shownWorkspace();
    const location = shown ? notesLocationOf(shown) : undefined;
    if (!shown || !location) return undefined;
    return {
      move: { workspaceId: shown.id, locationId: location.locationId, source: location.path },
      location,
    };
  }

  private notify(notice: MoveNotice): void {
    this.dependencies.showNotice(notice);
  }

  private notifyFailure(error: unknown): void {
    const problem: NotesMoveProblem =
      error instanceof NotesMoveError ? error.problem : { code: 'journalUnavailable' };
    this.notify(moveProblemNotice(problem, this.dependencies.locale));
  }
}

/** The notes folder itself, a folder inside it or around it, or another workspace's folder. */
function targetProblemKey(
  target: string,
  notesFolder: string,
  problem: 'claimed' | 'insideLocation' | 'containsLocation',
): MessageKey {
  if (isInsideFolder(target, notesFolder)) return 'notesLocation.move.problem.targetInsideLocation';
  if (isInsideFolder(notesFolder, target)) return 'notesLocation.move.problem.targetContainsLocation';
  return `workspaces.notes.claim.${problem}`;
}

function isOnFolder(location: NotesLocation | undefined, folder: string): boolean {
  return (
    location !== undefined && isInsideFolder(location.path, folder) && isInsideFolder(folder, location.path)
  );
}

function followMovedFolder(session: ViewerSession, previous: NotesLocation, target: DocumentLocation): void {
  const moved = (location: DocumentLocation) => locationMovedInto(location, previous, target);
  session.updateExplorerFolders((folders) => folders.remove(previous.canonicalKey).add(target));
  session.updateTabs((tabStrip) =>
    tabStrip.tabs().reduce((tabs, tab) => {
      const location = moved(tab.location);
      return location ? tabs.replace(tab.location.canonicalKey, location) : tabs;
    }, tabStrip),
  );
  session.updateFavourites((favourites) =>
    favourites.favourites().reduce((list, favourite) => {
      const location = moved(favourite.location);
      return location ? list.relocate(favourite.location.canonicalKey, location) : list;
    }, favourites),
  );
}

function removalNotice(
  oldCopy: OldNotesCopy,
  removal: {
    readonly recycledCount: number;
    readonly kept: { readonly paths: readonly string[]; readonly count: number };
    readonly hasNoRecycleBin: boolean;
  },
): MoveNotice {
  if (removal.hasNoRecycleBin)
    return { key: 'notesLocation.move.noRecycleBin', values: { path: oldCopy.path } };
  if (removal.kept.count === 0)
    return { key: 'notesLocation.move.removed', values: { count: removal.recycledCount } };
  return {
    key: 'notesLocation.move.removedKept',
    values: {
      recycled: removal.recycledCount,
      count: removal.kept.count,
      path: oldCopy.path,
      paths: removal.kept.paths.join(', '),
    },
  };
}
