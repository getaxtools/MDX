import { notesSettingsOf, type ViewerSession } from '@mdx/core';
import type { MessageKey, Translator } from '@mdx/i18n';
import {
  DocumentOpenError,
  type DocumentLocation,
  type ExportedNotes,
  type NotesExportSummary,
  type NotesImportProgress,
  type NotesImportReport,
  type NoteTransferPort,
} from '@mdx/platform';
import type { NoticeAction } from '../viewer/ViewerController';

export type NoteTransferCommand =
  | { readonly kind: 'importNotesFolder' }
  | { readonly kind: 'cancelNotesImport' }
  | { readonly kind: 'showNotesImportReport' }
  /** `name` is what the dialog calls the exported notes, such as a note or folder name. */
  | { readonly kind: 'showNotesExport'; readonly notes: ExportedNotes; readonly name: string }
  | { readonly kind: 'chooseNotesExportFolder' }
  | { readonly kind: 'setNotesExportRelativeLinks'; readonly isOn: boolean }
  | { readonly kind: 'startNotesExport' }
  | { readonly kind: 'replaceExportedNotes' }
  | { readonly kind: 'closeNotesTransfer' }
  | { readonly kind: 'exportNoteAsHtml'; readonly note: DocumentLocation }
  | { readonly kind: 'printNote'; readonly note: DocumentLocation };

export const NOTE_TRANSFER_COMMAND_KINDS: readonly NoteTransferCommand['kind'][] = [
  'importNotesFolder',
  'cancelNotesImport',
  'showNotesImportReport',
  'showNotesExport',
  'chooseNotesExportFolder',
  'setNotesExportRelativeLinks',
  'startNotesExport',
  'replaceExportedNotes',
  'closeNotesTransfer',
  'exportNoteAsHtml',
  'printNote',
];

/** An import while it runs, and its report once it is done. */
export interface NoteImportView {
  readonly progress: NotesImportProgress;
  readonly report?: NotesImportReport;
  readonly failure?: TransferFailure;
}

/** Why an import or export stopped, as a message with the folder it is about. */
export interface TransferFailure {
  readonly messageKey: MessageKey;
  readonly path: string;
}

export interface NoteExportView {
  readonly notes: ExportedNotes;
  readonly name: string;
  readonly destination?: string;
  /** The chosen folder was the location or inside it, so it was not taken. */
  readonly isDestinationRefused: boolean;
  readonly useRelativeLinks: boolean;
  readonly isExporting: boolean;
  /** Files already in the destination, while the user is asked whether to replace them. */
  readonly existingFileCount?: number;
  readonly summary?: NotesExportSummary;
  readonly failure?: TransferFailure;
}

export type NoteTransferDialog = 'noteImport' | 'noteExport';

export interface NoteTransferActionsDependencies {
  readonly session: ViewerSession;
  readonly noteTransfer: NoteTransferPort;
  readonly translator: Translator;
  readonly showNotice: (
    key: MessageKey,
    values?: Readonly<Record<string, string | number>>,
    actions?: readonly NoticeAction[],
  ) => void;
  readonly showTransferDialog: (dialog: NoteTransferDialog) => void;
  readonly closeTransferDialog: () => void;
  /** Exports or prints one note through the app's own HTML export and printing. */
  readonly showNoteAs: (note: DocumentLocation, output: 'html' | 'print') => Promise<void>;
  /** Imported notes changed the location, so shown folders list them again. */
  readonly onNotesChanged: () => void;
  readonly onChange: () => void;
}

const NO_PROGRESS: NotesImportProgress = { done: 0, total: 0, isListing: true };

/** Importing a vault-style folder into the shown location, and exporting notes out of it. */
export class NoteTransferActions {
  private importView: NoteImportView | undefined;
  private exportView: NoteExportView | undefined;
  /** The import dialog was closed while the import ran, so a notice tells when it is done. */
  private isImportInBackground = false;

  constructor(private readonly dependencies: NoteTransferActionsDependencies) {}

  importing(): NoteImportView | undefined {
    return this.importView;
  }

  exporting(): NoteExportView | undefined {
    return this.exportView;
  }

  async run(command: NoteTransferCommand, location: string): Promise<void> {
    const handlers: Readonly<Record<NoteTransferCommand['kind'], () => Promise<void> | void>> = {
      importNotesFolder: () => this.importFolder(location),
      cancelNotesImport: () => this.dependencies.noteTransfer.cancelImport(),
      showNotesImportReport: () => this.showImportReport(),
      showNotesExport: () => this.showExport(command),
      chooseNotesExportFolder: () => this.chooseDestination(location),
      setNotesExportRelativeLinks: () => this.setRelativeLinks(command),
      startNotesExport: () => this.export(location, { replaceExisting: false }),
      replaceExportedNotes: () => this.export(location, { replaceExisting: true }),
      closeNotesTransfer: () => this.close(),
      exportNoteAsHtml: () => this.showNoteAs(command, 'html'),
      printNote: () => this.showNoteAs(command, 'print'),
    };
    await handlers[command.kind]();
  }

  /** One import at a time: while one runs, choosing Import shows it again instead of asking for a folder. */
  private async importFolder(location: string): Promise<void> {
    if (this.isImportRunning()) {
      this.showImportReport();
      return;
    }
    const { noteTransfer } = this.dependencies;
    const source = await noteTransfer.pickImportFolder();
    if (source === undefined) return;
    this.importView = { progress: NO_PROGRESS };
    this.isImportInBackground = false;
    this.dependencies.showTransferDialog('noteImport');
    try {
      const report = await noteTransfer.importFolder(
        { location, source, excludedPaths: this.excludedPaths() },
        (progress) => this.changeImport({ progress }),
      );
      this.changeImport({ report });
    } catch (error) {
      this.changeImport({ failure: failureOf(error, source) });
    }
    this.dependencies.onNotesChanged();
    if (this.isImportRunningUnseen()) this.announceFinishedImport();
  }

  private announceFinishedImport(): void {
    const { translator, showNotice } = this.dependencies;
    const copied = this.importView?.report?.copiedFiles ?? 0;
    showNotice('notes.import.doneInBackground', { count: copied }, [
      { label: translator.translate('notes.import.showReport'), command: { kind: 'showNotesImportReport' } },
    ]);
  }

  private showImportReport(): void {
    if (!this.importView) return;
    this.isImportInBackground = false;
    this.dependencies.showTransferDialog('noteImport');
  }

  /** Read through a method: the dialog may have been closed while the import was awaited. */
  private isImportRunningUnseen(): boolean {
    return this.isImportInBackground;
  }

  private isImportRunning(): boolean {
    return this.importView !== undefined && !this.importView.report && this.importView.failure === undefined;
  }

  private changeImport(change: Partial<NoteImportView>): void {
    if (!this.importView) return;
    this.importView = { ...this.importView, ...change };
    this.dependencies.onChange();
  }

  private showExport(command: NoteTransferCommand): void {
    if (command.kind !== 'showNotesExport') return;
    this.exportView = {
      notes: command.notes,
      name: command.name,
      isDestinationRefused: false,
      useRelativeLinks: false,
      isExporting: false,
    };
    this.dependencies.showTransferDialog('noteExport');
  }

  private async chooseDestination(location: string): Promise<void> {
    const choice = await this.dependencies.noteTransfer.pickExportFolder(location);
    if (choice.choice === 'cancelled' || !this.exportView) return;
    const { notes, name } = this.exportView;
    this.exportView = {
      notes,
      name,
      useRelativeLinks: this.exportView.useRelativeLinks,
      isExporting: false,
      isDestinationRefused: choice.choice === 'insideLocation',
      ...(choice.choice === 'picked' ? { destination: choice.path } : {}),
    };
    this.dependencies.onChange();
  }

  private setRelativeLinks(command: NoteTransferCommand): void {
    if (command.kind !== 'setNotesExportRelativeLinks' || !this.exportView) return;
    this.exportView = { ...this.exportView, useRelativeLinks: command.isOn };
    this.dependencies.onChange();
  }

  private async export(
    location: string,
    { replaceExisting }: { readonly replaceExisting: boolean },
  ): Promise<void> {
    const shown = this.exportView;
    if (shown?.destination === undefined) return;
    this.exportView = { ...choicesOf(shown), isExporting: true };
    this.dependencies.onChange();
    try {
      const outcome = await this.dependencies.noteTransfer.exportNotes({
        location,
        notes: shown.notes,
        destination: shown.destination,
        useRelativeLinks: shown.useRelativeLinks,
        replaceExisting,
        excludedPaths: this.excludedPaths(),
      });
      this.finishExport(
        outcome.outcome === 'existingFiles' ? { existingFileCount: outcome.count } : { summary: outcome },
      );
    } catch (error) {
      this.finishExport({ failure: failureOf(error, shown.destination) });
    }
  }

  private finishExport(change: Partial<NoteExportView>): void {
    if (!this.exportView) return;
    this.exportView = { ...this.exportView, isExporting: false, ...change };
    this.dependencies.onChange();
  }

  /** A running import goes on without its dialog; anything else is forgotten. */
  private close(): void {
    if (this.isImportRunning()) this.isImportInBackground = true;
    else this.importView = undefined;
    this.exportView = undefined;
    this.dependencies.closeTransferDialog();
  }

  private async showNoteAs(command: NoteTransferCommand, output: 'html' | 'print'): Promise<void> {
    if (command.kind === 'exportNoteAsHtml' || command.kind === 'printNote')
      await this.dependencies.showNoteAs(command.note, output);
  }

  private excludedPaths(): readonly string[] {
    return notesSettingsOf(this.dependencies.session.shownWorkspace()).excludedPaths;
  }
}

/** The choices made so far, without the answer of an earlier export. */
function choicesOf(view: NoteExportView): NoteExportView {
  return {
    notes: view.notes,
    name: view.name,
    useRelativeLinks: view.useRelativeLinks,
    isDestinationRefused: view.isDestinationRefused,
    isExporting: false,
    ...(view.destination === undefined ? {} : { destination: view.destination }),
  };
}

function failureOf(error: unknown, path: string): TransferFailure {
  return {
    messageKey: error instanceof DocumentOpenError ? error.messageKey : 'errors.document.unreadable',
    path,
  };
}
