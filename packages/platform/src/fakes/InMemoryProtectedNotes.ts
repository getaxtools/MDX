import {
  ProtectedNotesError,
  type NewProtectedNote,
  type PasswordChange,
  type PasswordChangeResult,
  type ReencryptionProgress,
  type ProtectedNoteEdit,
  type ProtectedNoteSummary,
  type ProtectedNoteText,
  type ProtectedNotesLockedListener,
  type ProtectedNotesLockRequestListener,
  type ProtectedNotesPort,
  type ProtectedStatus,
  type UnlockResult,
} from '../ProtectedNotesPort';

const MIN_PASSWORD_LENGTH = 10;
const FIRST_TIME_MS = 1_000;
const HEX_RADIX = 16;
const NOTE_ID_LENGTH = 32;
const RECOVERY_NUMBER_LENGTH = 4;
const NOTE_ID = /^[0-9a-f]{32}$/;

interface StoredNote {
  readonly summary: ProtectedNoteSummary;
  readonly text: string;
  readonly revision: number;
}

interface Section {
  password: string;
  recoveryKey: string;
  isUnlocked: boolean;
  isRemembered: boolean;
  /** Notes still to seal again with a new key. */
  reencryptionRemaining: number;
  readonly notes: Map<string, StoredNote>;
}

/** Notes the fake seals again per call, as the native layer does a few at a time. */
const REENCRYPTION_BATCH = 16;

/** Protected sections in memory, behaving as the native ones do, for UI tests and component tests. */
export class InMemoryProtectedNotes implements ProtectedNotesPort {
  private readonly sections = new Map<string, Section>();
  private readonly lockListeners = new Set<ProtectedNotesLockedListener>();
  private readonly lockRequestListeners = new Set<ProtectedNotesLockRequestListener>();
  private nextNote = 0;
  private recoveryKeyCount = 0;
  private clock = FIRST_TIME_MS;

  status(location: string): Promise<ProtectedStatus> {
    const section = this.sections.get(location);
    return Promise.resolve({
      isSetUp: section !== undefined,
      isUnlocked: section?.isUnlocked === true,
      canUnlockOnThisPc: section?.isRemembered === true,
      isReencrypting: (section?.reencryptionRemaining ?? 0) > 0,
    });
  }

  setUp(location: string, password: string): Promise<{ readonly recoveryKey: string }> {
    if (codePointCount(password) < MIN_PASSWORD_LENGTH) return refused('passwordTooShort');
    if (this.sections.has(location)) return refused('alreadySetUp');
    const recoveryKey = this.newRecoveryKeyText();
    this.sections.set(location, {
      password,
      recoveryKey,
      isUnlocked: true,
      isRemembered: false,
      reencryptionRemaining: 0,
      notes: new Map(),
    });
    return Promise.resolve({ recoveryKey });
  }

  async unlock(location: string, password: string, shouldRemember: boolean): Promise<UnlockResult> {
    const section = await this.sectionOf(location);
    if (section.password !== password) return refused('wrongPassword');
    section.isUnlocked = true;
    if (shouldRemember) section.isRemembered = true;
    return {};
  }

  async unlockWithRecoveryKey(
    location: string,
    { recoveryKey, newPassword }: { readonly recoveryKey: string; readonly newPassword: string },
  ): Promise<UnlockResult> {
    if (codePointCount(newPassword) < MIN_PASSWORD_LENGTH) return refused('passwordTooShort');
    const section = await this.sectionOf(location);
    if (section.recoveryKey.toUpperCase() !== recoveryKey.trim().toUpperCase())
      return refused('wrongPassword');
    section.password = newPassword;
    section.isUnlocked = true;
    return {};
  }

  /** This PC stays remembered; the fake has no other PCs. */
  async changePassword(
    location: string,
    { currentPassword, newPassword, shouldReencrypt }: PasswordChange,
  ): Promise<PasswordChangeResult> {
    if (codePointCount(newPassword) < MIN_PASSWORD_LENGTH) return refused('passwordTooShort');
    const section = await this.unlockedSectionOf(location);
    if (section.password !== currentPassword) return refused('wrongPassword');
    if (section.reencryptionRemaining > 0) return refused('reencryptionPending');
    section.password = newPassword;
    if (!shouldReencrypt) return {};
    section.recoveryKey = this.newRecoveryKeyText();
    section.reencryptionRemaining = section.notes.size;
    return { recoveryKey: section.recoveryKey };
  }

  async continueReencryption(location: string): Promise<ReencryptionProgress> {
    const section = await this.unlockedSectionOf(location);
    section.reencryptionRemaining = Math.max(section.reencryptionRemaining - REENCRYPTION_BATCH, 0);
    return { remaining: section.reencryptionRemaining, damaged: 0, heldBack: 0, isUnverifiable: false };
  }

  /** The fake holds no files back, so finishing ends any re-encryption once the password matches. */
  async finishReencryption(location: string, password: string): Promise<void> {
    const section = await this.unlockedSectionOf(location);
    if (section.password !== password) return refused('wrongPassword');
    section.reencryptionRemaining = 0;
  }

  async newRecoveryKey(location: string, password: string): Promise<{ readonly recoveryKey: string }> {
    const section = await this.unlockedSectionOf(location);
    if (section.password !== password) return refused('wrongPassword');
    section.recoveryKey = this.newRecoveryKeyText();
    return { recoveryKey: section.recoveryKey };
  }

  async unlockOnThisPc(location: string): Promise<UnlockResult> {
    const section = await this.sectionOf(location);
    if (!section.isRemembered) return refused('notRemembered');
    section.isUnlocked = true;
    return {};
  }

  async acceptFolder(location: string): Promise<void> {
    await this.unlockedSectionOf(location);
  }

  async forgetThisPc(location: string): Promise<void> {
    const section = await this.unlockedSectionOf(location);
    section.isRemembered = false;
  }

  lock(location: string): Promise<void> {
    const section = this.sections.get(location);
    if (section?.isUnlocked === true) {
      section.isUnlocked = false;
      this.announceLocked([location]);
    }
    return Promise.resolve();
  }

  /** Every window that listens saves first, as the native side asks each open window. */
  async saveBeforeLock(location: string): Promise<boolean> {
    return this.askToSave([location]);
  }

  async lockAll(): Promise<void> {
    await this.askToSave([...this.sections].filter(([, section]) => section.isUnlocked).map(([key]) => key));
    const unlocked = [...this.sections].filter(([, section]) => section.isUnlocked);
    for (const [, section] of unlocked) section.isUnlocked = false;
    this.announceLocked(unlocked.map(([location]) => location));
  }

  onLockRequested(listener: ProtectedNotesLockRequestListener): () => void {
    this.lockRequestListeners.add(listener);
    return () => this.lockRequestListeners.delete(listener);
  }

  private async askToSave(locationKeys: readonly string[]): Promise<boolean> {
    if (locationKeys.length === 0) return true;
    const answers = await Promise.all(
      [...this.lockRequestListeners].map((listener) => listener(locationKeys).catch(() => false)),
    );
    return answers.every(Boolean);
  }

  /** The fake names sections by the location it was given, which tests use as the canonical key. */
  onLocked(listener: ProtectedNotesLockedListener): () => void {
    this.lockListeners.add(listener);
    return () => this.lockListeners.delete(listener);
  }

  private announceLocked(locationKeys: readonly string[]): void {
    if (locationKeys.length === 0) return;
    for (const listener of this.lockListeners) listener(locationKeys);
  }

  async list(location: string): Promise<ProtectedNoteSummary[]> {
    const section = await this.unlockedSectionOf(location);
    return [...section.notes.values()].map((note) => note.summary);
  }

  async create(location: string, { title, folder }: NewProtectedNote): Promise<string> {
    const section = await this.unlockedSectionOf(location);
    if (title.trim() === '') return refused('invalidRequest');
    this.nextNote += 1;
    const noteId = this.nextNote.toString(HEX_RADIX).padStart(NOTE_ID_LENGTH, '0');
    const summary: ProtectedNoteSummary = {
      noteId,
      title,
      folder,
      kind: 'note',
      modifiedMs: this.tick(),
      state: 'current',
    };
    section.notes.set(noteId, { summary, text: '', revision: 1 });
    return noteId;
  }

  async open(location: string, noteId: string): Promise<ProtectedNoteText> {
    if (!NOTE_ID.test(noteId)) return refused('invalidRequest');
    const section = await this.unlockedSectionOf(location);
    const note = section.notes.get(noteId);
    if (!note) return refused('notFound');
    return {
      text: note.text,
      encoding: 'utf-8',
      hasByteOrderMark: false,
      hasDecodingErrors: false,
      lineEnding: note.text.includes('\r\n') ? 'crlf' : 'lf',
      revision: note.revision,
      isOlderCopy: false,
    };
  }

  async save(location: string, edit: ProtectedNoteEdit): Promise<number> {
    if (!NOTE_ID.test(edit.noteId)) return refused('invalidRequest');
    const section = await this.unlockedSectionOf(location);
    const note = section.notes.get(edit.noteId);
    if (!note) return refused('notFound');
    const revision = note.revision + 1;
    section.notes.set(edit.noteId, {
      summary: { ...note.summary, modifiedMs: this.tick() },
      text: edit.text,
      revision,
    });
    return revision;
  }

  private sectionOf(location: string): Promise<Section> {
    const section = this.sections.get(location);
    return section ? Promise.resolve(section) : refused('notSetUp');
  }

  private async unlockedSectionOf(location: string): Promise<Section> {
    const section = await this.sectionOf(location);
    return section.isUnlocked ? section : refused('locked');
  }

  private newRecoveryKeyText(): string {
    this.recoveryKeyCount += 1;
    const number = String(this.recoveryKeyCount).padStart(RECOVERY_NUMBER_LENGTH, '0');
    return `RCVR-${number}-0000-0000-0000-0000-0000-0000-0000-0000-0000-0000-0000-00`;
  }

  private tick(): number {
    this.clock += 1;
    return this.clock;
  }
}

/** Characters as the native layer counts them: Unicode code points. */
function codePointCount(text: string): number {
  return Array.from(text).length;
}

function refused(failure: ConstructorParameters<typeof ProtectedNotesError>[0]): Promise<never> {
  return Promise.reject(new ProtectedNotesError(failure));
}
