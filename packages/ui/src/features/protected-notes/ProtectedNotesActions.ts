import { notesLocationOf, type ViewerSession } from '@mdx/core';
import { SHARED_RENDER_CACHE } from '@mdx/editor';
import type { MessageKey } from '@mdx/i18n';
import {
  ProtectedNotesError,
  isProtectedNoteIn,
  protectedNoteLocation,
  type DocumentLocation,
  type OpenedDocument,
  type ProtectedFolderWarning,
  type ProtectedNoteText,
  type ProtectedNotesFailure,
  type ProtectedNotesPort,
  type ProtectedStatus,
  type UnlockResult,
} from '@mdx/platform';
import type { ProtectedNotesCommand } from './protectedNotesCommands';

export type ProtectedSectionState = 'notSetUp' | 'locked' | 'unlocked';

export interface ProtectedNoteListing {
  readonly noteId: string;
  readonly title: string;
  /** The key of the note's tab, to mark the note that is shown. */
  readonly canonicalKey: string;
}

/** The protected section of the shown Notes workspace. */
export interface ProtectedNotesView {
  readonly state: ProtectedSectionState;
  readonly canUnlockOnThisPc: boolean;
  /** Empty while a folder warning waits for the user. */
  readonly notes: readonly ProtectedNoteListing[];
  /** A password is being checked, which takes a moment on purpose. */
  readonly isBusy: boolean;
  /** Shown only during set-up while the section is unlocked, until the user has typed its end back. */
  readonly recoveryKey?: string;
  /** The section locked before its recovery key was confirmed; unlocking shows the key again. */
  readonly isRecoveryKeyCovered?: boolean;
  readonly setUpProblem?: MessageKey;
  readonly unlockProblem?: MessageKey;
  /** The folder looks older than this PC last saw it; the notes stay hidden until the user keeps it. */
  readonly folderWarning?: ProtectedFolderWarning;
  /** Some edits could not be saved before a lock the user asked for, so the user chooses. */
  readonly isAskingToLock?: boolean;
}

export interface ProtectedNotesActionsDependencies {
  readonly session: ViewerSession;
  readonly protectedNotes: ProtectedNotesPort;
  /** The native side checks which workspace the window shows, so it must have heard the last report. */
  readonly whenWindowReported: () => Promise<void>;
  readonly showSetUpDialog: () => void;
  readonly closeSetUpDialog: () => void;
  readonly showNotice: (key: MessageKey, values?: Readonly<Record<string, string>>) => void;
  /** Saves the unsaved edits of this window's protected notes before a lock; false when one was not saved. */
  readonly saveProtectedEdits: () => Promise<boolean>;
  /** Whether this window still has unsaved edits of protected notes. */
  readonly hasUnsavedProtectedEdits: () => boolean;
  /** Starts editing the active document, as a new note is opened for typing. */
  readonly startEditing: () => void;
  /** Waits before a password is tried again; a real timer unless a test sets it. */
  readonly wait: (delayMs: number) => Promise<void>;
  readonly now: () => number;
  readonly onChange: () => void;
}

interface ShownSection {
  /** The notes location's folder, as the native side is asked about it. */
  readonly path: string;
  /** The notes location's canonical key, which names the section's notes in tab keys. */
  readonly key: string;
}

type ProblemKeys = Partial<Record<ProtectedNotesFailure, MessageKey>>;

/** After this many wrong passwords in a row, each next try waits first. */
export const WRONG_PASSWORDS_BEFORE_DELAY = 3;
export const RETRY_DELAY_MS = 1_000;

const SET_UP_PROBLEMS: ProblemKeys = {
  passwordTooShort: 'protectedNotes.setUp.tooShort',
  alreadySetUp: 'protectedNotes.setUp.alreadySetUp',
  notEnoughMemory: 'protectedNotes.notEnoughMemory',
};
const UNLOCK_PROBLEMS: ProblemKeys = {
  wrongPassword: 'protectedNotes.unlock.wrongPassword',
  notRemembered: 'protectedNotes.unlock.notRemembered',
  notEnoughMemory: 'protectedNotes.notEnoughMemory',
  tampered: 'protectedNotes.unlock.damaged',
};
const RECOVERY_PROBLEMS: ProblemKeys = {
  ...UNLOCK_PROBLEMS,
  wrongPassword: 'protectedNotes.unlock.wrongRecoveryKey',
  invalidRequest: 'protectedNotes.unlock.wrongRecoveryKey',
  passwordTooShort: 'protectedNotes.setUp.tooShort',
};
const OPEN_PROBLEMS: ProblemKeys = { tampered: 'protectedNotes.open.damaged' };

/**
 * Set-up, unlock and the notes of the shown Notes workspace's protected section. Its notes open only
 * as protected tabs, from text the section decrypted, and are saved only back into it.
 */
export class ProtectedNotesActions {
  private section: ShownSection | undefined;
  private status: ProtectedStatus | undefined;
  private notes: readonly ProtectedNoteListing[] = [];
  private isBusy = false;
  /** Recovery keys not confirmed yet, by section: kept for this session, shown only while unlocked. */
  private readonly unconfirmedRecoveryKeys = new Map<string, string>();
  private setUpProblem: MessageKey | undefined;
  private unlockProblem: MessageKey | undefined;
  private folderWarning: ProtectedFolderWarning | undefined;
  private wrongPasswordsInARow = 0;
  private isAskingToLock = false;
  private readingKey: string | undefined;

  constructor(private readonly dependencies: ProtectedNotesActionsDependencies) {}

  view(): ProtectedNotesView | undefined {
    const { status } = this;
    if (!status || this.section?.key !== this.shownSection()?.key) return undefined;
    return {
      state: stateOf(status),
      canUnlockOnThisPc: status.canUnlockOnThisPc,
      notes: this.folderWarning ? [] : this.notes,
      isBusy: this.isBusy,
      ...this.recoveryKeyPart(status),
      ...(this.setUpProblem === undefined ? {} : { setUpProblem: this.setUpProblem }),
      ...(this.unlockProblem === undefined ? {} : { unlockProblem: this.unlockProblem }),
      ...(this.folderWarning === undefined ? {} : { folderWarning: this.folderWarning }),
      ...(this.isAskingToLock ? { isAskingToLock: true } : {}),
    };
  }

  /** Follows sections locking in any window, whose notes then close here too; returns how to stop. */
  start(): () => void {
    const { protectedNotes, saveProtectedEdits } = this.dependencies;
    const stopFollowingLocks = protectedNotes.onLocked((locationKeys) => void this.followLock(locationKeys));
    const stopSavingBeforeLocks = protectedNotes.onLockRequested(() => saveProtectedEdits());
    return () => {
      stopFollowingLocks();
      stopSavingBeforeLocks();
    };
  }

  /** Reads the section again when another workspace is shown, or when it could not be read before. */
  async refreshIfChanged(): Promise<void> {
    const shown = this.shownSection();
    const isKnown = this.status !== undefined || this.readingKey !== undefined;
    if (shown?.key === this.section?.key && (isKnown || shown === undefined)) return;
    await this.refresh();
  }

  async run(command: ProtectedNotesCommand): Promise<void> {
    const runner = this.commandRunners[command.kind] as (
      command: ProtectedNotesCommand,
    ) => Promise<void> | void;
    await runner(command);
  }

  private readonly commandRunners: {
    readonly [Kind in ProtectedNotesCommand['kind']]: (
      command: Extract<ProtectedNotesCommand, { kind: Kind }>,
    ) => Promise<void> | void;
  } = {
    showProtectedSetUp: () => this.showSetUp(),
    setUpProtectedSection: ({ password }) => this.setUp(password),
    finishProtectedSetUp: () => this.finishSetUp(),
    unlockProtectedSection: ({ password, shouldRemember }) =>
      this.unlock(
        (path) => this.dependencies.protectedNotes.unlock(path, password, shouldRemember),
        UNLOCK_PROBLEMS,
      ),
    unlockProtectedOnThisPc: () =>
      this.unlock((path) => this.dependencies.protectedNotes.unlockOnThisPc(path), UNLOCK_PROBLEMS),
    unlockProtectedWithRecoveryKey: ({ recoveryKey, newPassword }) =>
      this.unlock(
        (path) => this.dependencies.protectedNotes.unlockWithRecoveryKey(path, { recoveryKey, newPassword }),
        RECOVERY_PROBLEMS,
      ),
    acceptProtectedFolder: () => this.acceptFolder(),
    forgetProtectedOnThisPc: () => this.forgetThisPc(),
    openProtectedNote: async ({ noteId }) => {
      await this.openNote(noteId);
    },
    createProtectedNote: ({ title }) => this.createNote(title),
    lockProtectedNotes: () => this.lock(),
    confirmProtectedLock: () => this.confirmLock(),
    cancelProtectedLock: () => this.cancelLock(),
  };

  private recoveryKeyPart(
    status: ProtectedStatus,
  ): Pick<ProtectedNotesView, 'recoveryKey' | 'isRecoveryKeyCovered'> {
    const recoveryKey = this.section ? this.unconfirmedRecoveryKeys.get(this.section.key) : undefined;
    if (recoveryKey === undefined) return {};
    return status.isUnlocked ? { recoveryKey } : { isRecoveryKeyCovered: true };
  }

  private async refresh(): Promise<void> {
    const shown = this.shownSection();
    if (shown?.key !== this.section?.key) this.forgetSection();
    this.section = shown;
    if (shown) await this.readSection(shown);
    this.offerUnconfirmedRecoveryKey();
    this.dependencies.onChange();
  }

  /** Set-up waits for its recovery key to be confirmed, so the key shows again once its section is unlocked. */
  private offerUnconfirmedRecoveryKey(): void {
    const { section } = this;
    if (section && this.status?.isUnlocked === true && this.unconfirmedRecoveryKeys.has(section.key)) {
      this.dependencies.showSetUpDialog();
    }
  }

  /** Another workspace is shown; an unfinished set-up waits, and the user is told it does. */
  private forgetSection(): void {
    if (this.section && this.unconfirmedRecoveryKeys.has(this.section.key)) {
      this.dependencies.closeSetUpDialog();
      this.dependencies.showNotice('protectedNotes.setUp.unfinished');
    }
    this.status = undefined;
    this.notes = [];
    this.setUpProblem = undefined;
    this.unlockProblem = undefined;
    this.folderWarning = undefined;
    this.wrongPasswordsInARow = 0;
  }

  /** A section that cannot be read stays unknown and is read again on the next change. */
  private async readSection(section: ShownSection): Promise<void> {
    this.readingKey = section.key;
    try {
      await this.dependencies.whenWindowReported();
      const status = await this.dependencies.protectedNotes.status(section.path);
      const notes = status.isUnlocked ? await this.listNotes(section) : [];
      if (this.section !== section) return;
      this.status = status;
      this.notes = notes;
      if (!status.isUnlocked) this.folderWarning = undefined;
    } catch {
      if (this.section === section && this.status === undefined) this.section = undefined;
    } finally {
      if (this.readingKey === section.key) this.readingKey = undefined;
    }
  }

  private async listNotes(section: ShownSection): Promise<ProtectedNoteListing[]> {
    const summaries = await this.dependencies.protectedNotes.list(section.path);
    return summaries
      .filter((summary) => summary.kind === 'note')
      .map(({ noteId, title }) => ({
        noteId,
        title,
        canonicalKey: protectedNoteLocation(section.key, noteId, title).canonicalKey,
      }))
      .sort((first, second) => first.title.localeCompare(second.title));
  }

  private showSetUp(): void {
    if (!this.section || this.status?.isSetUp !== false) return;
    this.setUpProblem = undefined;
    this.dependencies.showSetUpDialog();
  }

  private async setUp(password: string): Promise<void> {
    const { section } = this;
    if (!section || this.isBusy || this.status?.isSetUp !== false) return;
    await this.whileBusy(async () => {
      this.setUpProblem = undefined;
      try {
        const { recoveryKey } = await this.dependencies.protectedNotes.setUp(section.path, password);
        this.unconfirmedRecoveryKeys.set(section.key, recoveryKey);
        this.status = { isSetUp: true, isUnlocked: true, canUnlockOnThisPc: false, isReencrypting: false };
      } catch (error) {
        this.setUpProblem = problemOf(error, SET_UP_PROBLEMS, 'protectedNotes.setUp.failed');
      }
    });
  }

  /** The user typed the end of the recovery key back, so it is never shown again. */
  private async finishSetUp(): Promise<void> {
    const { section } = this;
    if (!section || this.status?.isUnlocked !== true || !this.unconfirmedRecoveryKeys.delete(section.key))
      return;
    this.dependencies.closeSetUpDialog();
    await this.refresh();
  }

  /** After the third wrong password in a row, each try waits a moment first. */
  private async unlock(
    attempt: (path: string) => Promise<UnlockResult>,
    problems: ProblemKeys,
  ): Promise<void> {
    const { section } = this;
    if (!section || this.isBusy || this.status?.isUnlocked !== false) return;
    await this.whileBusy(async () => {
      this.unlockProblem = undefined;
      try {
        if (this.wrongPasswordsInARow >= WRONG_PASSWORDS_BEFORE_DELAY)
          await this.dependencies.wait(RETRY_DELAY_MS);
        const { folderWarning } = await attempt(section.path);
        this.wrongPasswordsInARow = 0;
        this.folderWarning = folderWarning;
        await this.readSection(section);
        this.offerUnconfirmedRecoveryKey();
      } catch (error) {
        if (error instanceof ProtectedNotesError && error.failure === 'wrongPassword')
          this.wrongPasswordsInARow += 1;
        this.unlockProblem = problemOf(error, problems, 'protectedNotes.unlock.failed');
      }
    });
  }

  /** Only the folder warning's own button keeps the folder, which updates what this PC saw of it. */
  private async acceptFolder(): Promise<void> {
    const { section } = this;
    if (!section || this.folderWarning === undefined) return;
    try {
      await this.dependencies.protectedNotes.acceptFolder(section.path);
      this.folderWarning = undefined;
    } catch {
      await this.readSection(section);
    }
    this.dependencies.onChange();
  }

  private async forgetThisPc(): Promise<void> {
    const { section } = this;
    if (!section || this.status?.isUnlocked !== true) return;
    try {
      await this.dependencies.protectedNotes.forgetThisPc(section.path);
      await this.readSection(section);
      this.dependencies.showNotice('protectedNotes.unlock.forgotten');
    } catch {
      this.dependencies.showNotice('protectedNotes.unlock.forgetFailed');
    }
    this.dependencies.onChange();
  }

  /** Resolves to whether the note is shown in its tab. */
  private async openNote(noteId: string): Promise<boolean> {
    const { section } = this;
    const listing = this.notes.find((note) => note.noteId === noteId);
    if (!section || !listing || this.folderWarning !== undefined) return false;
    const location = protectedNoteLocation(section.key, noteId, listing.title);
    const { session, protectedNotes } = this.dependencies;
    if (session.currentState().tabStrip.isOpen(location.canonicalKey)) {
      session.updateTabs((tabStrip) => tabStrip.openOrFocus(location));
      return true;
    }
    try {
      const opened = await protectedNotes.open(section.path, noteId);
      if (this.section !== section || this.status?.isUnlocked !== true) return false;
      session.openProtectedNote(this.documentOf(location, opened), (text) =>
        this.saveNote(section, noteId, { ...opened, text }),
      );
      if (opened.isOlderCopy)
        this.dependencies.showNotice('protectedNotes.open.olderCopy', { name: listing.title });
      return true;
    } catch (error) {
      const key = problemOf(error, OPEN_PROBLEMS, 'protectedNotes.open.failed');
      this.dependencies.showNotice(key, { name: listing.title });
      return false;
    }
  }

  private documentOf(location: DocumentLocation, opened: ProtectedNoteText): OpenedDocument {
    const { text, encoding, hasByteOrderMark, hasDecodingErrors, lineEnding } = opened;
    return {
      location,
      text,
      encoding,
      hasByteOrderMark,
      ...(hasDecodingErrors ? { hasDecodingErrors } : {}),
      lineEnding,
      modifiedAtMs: this.dependencies.now(),
    };
  }

  private async saveNote(section: ShownSection, noteId: string, note: ProtectedNoteText): Promise<void> {
    const { text, encoding, hasByteOrderMark } = note;
    await this.dependencies.protectedNotes.save(section.path, { noteId, text, encoding, hasByteOrderMark });
  }

  private async createNote(title: string): Promise<void> {
    const { section } = this;
    const trimmedTitle = title.trim();
    if (!section || trimmedTitle === '' || this.folderWarning !== undefined) return;
    try {
      const noteId = await this.dependencies.protectedNotes.create(section.path, {
        title: trimmedTitle,
        folder: '',
      });
      this.notes = await this.listNotes(section);
      this.dependencies.onChange();
      if (await this.openNote(noteId)) this.dependencies.startEditing();
    } catch {
      this.dependencies.showNotice('protectedNotes.create.failed');
    }
  }

  /** Every window saves its edits of the section's notes first; when one could not, the user chooses. */
  private async lock(): Promise<void> {
    const { section } = this;
    if (!section || this.status?.isUnlocked !== true || this.isAskingToLock) return;
    const isEverythingSaved = await this.dependencies.protectedNotes
      .saveBeforeLock(section.path)
      .catch(() => false);
    if (isEverythingSaved) {
      await this.lockNow(section);
      return;
    }
    this.isAskingToLock = true;
    this.dependencies.onChange();
  }

  private async confirmLock(): Promise<void> {
    const { section } = this;
    if (!section || !this.isAskingToLock) return;
    this.isAskingToLock = false;
    await this.lockNow(section);
  }

  private cancelLock(): void {
    this.isAskingToLock = false;
    this.dependencies.onChange();
  }

  /** Locks and closes the section's tabs, which forgets their text. */
  private async lockNow(section: ShownSection): Promise<void> {
    try {
      await this.dependencies.protectedNotes.lock(section.path);
    } finally {
      this.closeNotesOf(section);
      await this.readSection(section);
      this.dependencies.onChange();
    }
  }

  /** Another window or the app locked sections; this one is read again in case it was among them. */
  private async followLock(locationKeys: readonly string[]): Promise<void> {
    const { section } = this;
    if (!section) return;
    if (locationKeys.includes(section.key)) this.closeNotesOf(section);
    await this.readSection(section);
    if (this.status?.isUnlocked === false) this.closeNotesOf(section);
    this.dependencies.onChange();
  }

  /** Closes the section's tabs and drops whatever was rendered of them. */
  private closeNotesOf(section: ShownSection): void {
    this.notes = [];
    this.folderWarning = undefined;
    this.isAskingToLock = false;
    const { session, hasUnsavedProtectedEdits, showNotice } = this.dependencies;
    if (hasUnsavedProtectedEdits()) showNotice('protectedNotes.lock.editsLost');
    const closingKeys = session
      .currentState()
      .tabStrip.tabs()
      .map((tab) => tab.location)
      .filter((location) => isProtectedNoteIn(location, section.key))
      .map((location) => location.canonicalKey);
    session.closeProtectedNotesOf(section.key);
    for (const canonicalKey of closingKeys) SHARED_RENDER_CACHE.forgetDocument(canonicalKey);
  }

  private async whileBusy(work: () => Promise<void>): Promise<void> {
    this.isBusy = true;
    this.dependencies.onChange();
    try {
      await work();
    } finally {
      this.isBusy = false;
      this.dependencies.onChange();
    }
  }

  private shownSection(): ShownSection | undefined {
    const shown = this.dependencies.session.shownWorkspace();
    const location = shown ? notesLocationOf(shown) : undefined;
    return location ? { path: location.path, key: location.canonicalKey } : undefined;
  }
}

function stateOf(status: ProtectedStatus): ProtectedSectionState {
  if (!status.isSetUp) return 'notSetUp';
  return status.isUnlocked ? 'unlocked' : 'locked';
}

function problemOf(error: unknown, problems: ProblemKeys, fallback: MessageKey): MessageKey {
  return (error instanceof ProtectedNotesError ? problems[error.failure] : undefined) ?? fallback;
}
