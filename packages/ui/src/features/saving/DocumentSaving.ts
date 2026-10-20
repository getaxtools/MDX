import type { ViewerSession } from '@mdx/core';
import { DocumentOpenError, isUntitledLocation, type DocumentLocation } from '@mdx/platform';
import type { DocumentEditing } from '../editing/DocumentEditing';
import { applyTabCommand, type TabCommand } from '../tabs/tabCommands';

export type UnsavedChangesChoice = 'save' | 'discard' | 'cancel';

export interface UnsavedChangesRequest {
  readonly fileNames: readonly string[];
}

export interface DocumentSavingCallbacks {
  readonly onChange: () => void;
  readonly onSaveFailed: (fileName: string) => void;
  /** Another program changed the file since it was opened, so saving would overwrite that. */
  readonly onChangedOnDisk: (location: DocumentLocation) => void;
  /** Saving over the file would lose text: the encoding cannot store it, or could not read it. */
  readonly onCannotSaveInPlace: (
    location: DocumentLocation,
    failure: 'cannotEncode' | 'lossyDecoding',
  ) => void;
}

interface PendingClose {
  readonly locations: readonly DocumentLocation[];
  readonly proceed: (savedKeys: ReadonlyMap<string, string>) => void;
  readonly abandon: () => void;
}

/**
 * Save, Save As and Save All for edited documents and new documents, and the Save / Don't Save /
 * Cancel question before documents with unsaved changes close.
 */
export class DocumentSaving {
  private pendingClose: PendingClose | undefined;

  constructor(
    private readonly session: ViewerSession,
    private readonly editing: DocumentEditing,
    private readonly callbacks: DocumentSavingCallbacks,
  ) {}

  unsavedChangesRequest(): UnsavedChangesRequest | undefined {
    return this.pendingClose
      ? { fileNames: this.pendingClose.locations.map((location) => location.fileName) }
      : undefined;
  }

  hasUnsavedDocuments(): boolean {
    return this.unsavedLocations().length > 0;
  }

  async saveActive(): Promise<void> {
    const location = this.session.currentState().tabStrip.activeTab()?.location;
    if (location && this.isUnsaved(location)) await this.save(location);
  }

  async saveActiveAs(): Promise<void> {
    const location = this.session.currentState().tabStrip.activeTab()?.location;
    if (location) await this.saveAs(location);
  }

  async saveAll(): Promise<void> {
    for (const location of this.unsavedLocations()) {
      if (!(await this.save(location))) return;
    }
  }

  /** Saves edited text over a file that another program changed, after the user agreed. */
  async overwriteChangesOnDisk(canonicalKey: string): Promise<void> {
    const location = this.openLocation(canonicalKey);
    if (location) await this.saveEdited(location, { shouldOverwriteChangesOnDisk: true });
  }

  runTabCommand(command: TabCommand): void {
    const closingLocations = this.unsavedLocationsClosedBy(command);
    if (closingLocations.length === 0) {
      this.applyTabCommand(command);
      return;
    }
    this.ask(closingLocations, {
      proceed: (savedKeys) => this.applyTabCommand(withSavedKeys(command, savedKeys)),
      abandon: () => undefined,
    });
  }

  /** Resolves to true when the window may close, after the user saved or discarded their changes. */
  confirmClosingWindow(): Promise<boolean> {
    const locations = this.unsavedLocations();
    if (locations.length === 0) return Promise.resolve(true);
    return new Promise((resolve) =>
      this.ask(locations, { proceed: () => resolve(true), abandon: () => resolve(false) }),
    );
  }

  async answer(choice: UnsavedChangesChoice): Promise<void> {
    const pending = this.pendingClose;
    if (!pending) return;
    this.pendingClose = undefined;
    this.callbacks.onChange();
    if (choice === 'cancel') {
      pending.abandon();
      return;
    }
    const savedKeys = choice === 'save' ? await this.saveEach(pending.locations) : new Map<string, string>();
    if (savedKeys) pending.proceed(savedKeys);
    else pending.abandon();
  }

  /** The saved key of each document, or undefined as soon as one is not saved. */
  private async saveEach(locations: readonly DocumentLocation[]): Promise<Map<string, string> | undefined> {
    const savedKeys = new Map<string, string>();
    for (const location of locations) {
      const saved = await this.save(location);
      if (!saved) return undefined;
      savedKeys.set(location.canonicalKey, saved.canonicalKey);
    }
    return savedKeys;
  }

  private ask(locations: readonly DocumentLocation[], answers: Omit<PendingClose, 'locations'>): void {
    this.pendingClose?.abandon();
    this.pendingClose = { locations, ...answers };
    this.callbacks.onChange();
  }

  private save(location: DocumentLocation): Promise<DocumentLocation | undefined> {
    return isUntitledLocation(location) ? this.saveAs(location) : this.saveEdited(location);
  }

  private async saveAs(location: DocumentLocation): Promise<DocumentLocation | undefined> {
    const { canonicalKey } = location;
    const wasEditing = this.editing.isEditing(canonicalKey);
    try {
      const saved = await this.session.saveDocumentAs(canonicalKey, this.editing.editedTextOf(canonicalKey));
      if (saved) this.continueEditingUnder(canonicalKey, saved.canonicalKey, wasEditing);
      return saved;
    } catch {
      this.callbacks.onSaveFailed(location.fileName);
      return undefined;
    }
  }

  /** Saving under a new name gives the tab a new key; the document stays open for editing there. */
  private continueEditingUnder(previousKey: string, savedKey: string, wasEditing: boolean): void {
    this.editing.rename(previousKey, savedKey);
    if (wasEditing && !this.editing.isEditing(savedKey)) this.editing.toggleEditing(savedKey);
    this.callbacks.onChange();
  }

  private async saveEdited(
    location: DocumentLocation,
    options: { readonly shouldOverwriteChangesOnDisk?: boolean } = {},
  ): Promise<DocumentLocation | undefined> {
    const editedText = this.editing.editedTextOf(location.canonicalKey);
    if (editedText === undefined) return location;
    try {
      await this.session.saveEditedDocument(location.canonicalKey, editedText, options);
      this.keepTextTypedDuringSave(location.canonicalKey, editedText);
      this.callbacks.onChange();
      return location;
    } catch (error) {
      this.reportSaveFailure(error, location);
      return undefined;
    }
  }

  /** Text typed while the file was being written is still unsaved; anything else now matches the file. */
  private keepTextTypedDuringSave(canonicalKey: string, savedEditedText: string): void {
    const currentText = this.editing.editedTextOf(canonicalKey);
    const savedText = this.session.openedDocument(canonicalKey)?.text;
    if (currentText === undefined || currentText === savedEditedText || savedText === undefined) {
      this.editing.discardChanges(canonicalKey);
      return;
    }
    this.editing.updateText(canonicalKey, currentText, savedText);
  }

  private reportSaveFailure(error: unknown, location: DocumentLocation): void {
    const failure = error instanceof DocumentOpenError ? error.failure : undefined;
    if (failure === 'changedOnDisk') this.callbacks.onChangedOnDisk(location);
    else if (failure === 'cannotEncode' || failure === 'lossyDecoding') {
      this.callbacks.onCannotSaveInPlace(location, failure);
    } else this.callbacks.onSaveFailed(location.fileName);
  }

  private applyTabCommand(command: TabCommand): void {
    this.session.updateTabs((tabStrip) => applyTabCommand(tabStrip, command));
  }

  private isUnsaved(location: DocumentLocation): boolean {
    return isUntitledLocation(location) || this.editing.hasUnsavedChanges(location.canonicalKey);
  }

  private openLocation(canonicalKey: string): DocumentLocation | undefined {
    return this.session
      .currentState()
      .tabStrip.tabs()
      .find((tab) => tab.location.canonicalKey === canonicalKey)?.location;
  }

  private unsavedLocations(): DocumentLocation[] {
    return this.session
      .currentState()
      .tabStrip.tabs()
      .map((tab) => tab.location)
      .filter((location) => this.isUnsaved(location));
  }

  private unsavedLocationsClosedBy(command: TabCommand): DocumentLocation[] {
    const remainingTabs = applyTabCommand(this.session.currentState().tabStrip, command);
    return this.unsavedLocations().filter((location) => !remainingTabs.isOpen(location.canonicalKey));
  }
}

/** A command aimed at a new document must now aim at the file it was saved as. */
function withSavedKeys(command: TabCommand, savedKeys: ReadonlyMap<string, string>): TabCommand {
  if (!('canonicalKey' in command)) return command;
  const savedKey = savedKeys.get(command.canonicalKey);
  return savedKey === undefined ? command : { ...command, canonicalKey: savedKey };
}
