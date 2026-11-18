import { notesLocationOf, type ViewerSession } from '@mdx/core';
import type { MessageKey } from '@mdx/i18n';
import {
  ProtectedNotesError,
  protectedNoteLocation,
  type ProtectedNotesFailure,
  type ProtectedNotesPort,
  type ProtectedStatus,
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
  readonly notes: readonly ProtectedNoteListing[];
  /** A password is being checked, which takes a moment on purpose. */
  readonly isBusy: boolean;
  /** Shown only during set-up, until the user has typed its end back. */
  readonly recoveryKey?: string;
  readonly setUpProblem?: MessageKey;
}

export interface ProtectedNotesActionsDependencies {
  readonly session: ViewerSession;
  readonly protectedNotes: ProtectedNotesPort;
  /** The native side checks which workspace the window shows, so it must have heard the last report. */
  readonly whenWindowReported: () => Promise<void>;
  readonly showSetUpDialog: () => void;
  readonly closeSetUpDialog: () => void;
  readonly onChange: () => void;
}

interface ShownSection {
  /** The notes location's folder, as the native side is asked about it. */
  readonly path: string;
  /** The notes location's canonical key, which names the section's notes in tab keys. */
  readonly key: string;
}

const SET_UP_PROBLEMS: Partial<Record<ProtectedNotesFailure, MessageKey>> = {
  passwordTooShort: 'protectedNotes.setUp.tooShort',
  alreadySetUp: 'protectedNotes.setUp.alreadySetUp',
  notEnoughMemory: 'protectedNotes.notEnoughMemory',
};

/** Set-up of the shown Notes workspace's protected section, and what the side bar shows of it. */
export class ProtectedNotesActions {
  private section: ShownSection | undefined;
  private status: ProtectedStatus | undefined;
  private notes: readonly ProtectedNoteListing[] = [];
  private isBusy = false;
  private recoveryKey: string | undefined;
  private setUpProblem: MessageKey | undefined;
  private readingKey: string | undefined;

  constructor(private readonly dependencies: ProtectedNotesActionsDependencies) {}

  view(): ProtectedNotesView | undefined {
    const { status } = this;
    if (!status || this.section?.key !== this.shownSection()?.key) return undefined;
    return {
      state: stateOf(status),
      canUnlockOnThisPc: status.canUnlockOnThisPc,
      notes: this.notes,
      isBusy: this.isBusy,
      ...(this.recoveryKey === undefined ? {} : { recoveryKey: this.recoveryKey }),
      ...(this.setUpProblem === undefined ? {} : { setUpProblem: this.setUpProblem }),
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
    if (command.kind === 'showProtectedSetUp') this.showSetUp();
    else if (command.kind === 'setUpProtectedSection') await this.setUp(command.password);
    else await this.finishSetUp();
  }

  private async refresh(): Promise<void> {
    const shown = this.shownSection();
    if (shown?.key !== this.section?.key) this.forgetSection();
    this.section = shown;
    if (shown) await this.readSection(shown);
    this.dependencies.onChange();
  }

  private forgetSection(): void {
    this.status = undefined;
    this.notes = [];
    this.recoveryKey = undefined;
    this.setUpProblem = undefined;
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
    this.isBusy = true;
    this.setUpProblem = undefined;
    this.dependencies.onChange();
    try {
      const { recoveryKey } = await this.dependencies.protectedNotes.setUp(section.path, password);
      this.recoveryKey = recoveryKey;
      this.status = { isSetUp: true, isUnlocked: true, canUnlockOnThisPc: false };
    } catch (error) {
      this.setUpProblem = problemOf(error, SET_UP_PROBLEMS, 'protectedNotes.setUp.failed');
    } finally {
      this.isBusy = false;
      this.dependencies.onChange();
    }
  }

  /** The user typed the end of the recovery key back, so it is never shown again. */
  private async finishSetUp(): Promise<void> {
    if (this.recoveryKey === undefined) return;
    this.recoveryKey = undefined;
    this.dependencies.closeSetUpDialog();
    await this.refresh();
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

function problemOf(
  error: unknown,
  problems: Partial<Record<ProtectedNotesFailure, MessageKey>>,
  fallback: MessageKey,
): MessageKey {
  return (error instanceof ProtectedNotesError ? problems[error.failure] : undefined) ?? fallback;
}
