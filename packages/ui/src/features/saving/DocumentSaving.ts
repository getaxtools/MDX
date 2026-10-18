import type { ViewerSession } from '@mdx/core';
import { isUntitledLocation, type DocumentLocation } from '@mdx/platform';
import { applyTabCommand, type TabCommand } from '../tabs/tabCommands';

export type UnsavedChangesChoice = 'save' | 'discard' | 'cancel';

export interface UnsavedChangesRequest {
  readonly fileNames: readonly string[];
}

export interface DocumentSavingCallbacks {
  readonly onChange: () => void;
  readonly onSaveFailed: (fileName: string) => void;
}

interface PendingClose {
  readonly locations: readonly DocumentLocation[];
  readonly proceed: (savedKeys: ReadonlyMap<string, string>) => void;
  readonly abandon: () => void;
}

/** Save, Save As and Save All, and the Save / Don't Save / Cancel question before new documents close. */
export class DocumentSaving {
  private pendingClose: PendingClose | undefined;

  constructor(
    private readonly session: ViewerSession,
    private readonly callbacks: DocumentSavingCallbacks,
  ) {}

  unsavedChangesRequest(): UnsavedChangesRequest | undefined {
    return this.pendingClose
      ? { fileNames: this.pendingClose.locations.map((location) => location.fileName) }
      : undefined;
  }

  hasUnsavedDocuments(): boolean {
    return this.untitledLocations().length > 0;
  }

  /** Saving a document that already has a file changes nothing, because the viewer never edits it. */
  async saveActive(): Promise<void> {
    const location = this.session.currentState().tabStrip.activeTab()?.location;
    if (location && isUntitledLocation(location)) await this.saveAs(location);
  }

  async saveActiveAs(): Promise<void> {
    const location = this.session.currentState().tabStrip.activeTab()?.location;
    if (location) await this.saveAs(location);
  }

  async saveAll(): Promise<void> {
    for (const location of this.untitledLocations()) {
      if (!(await this.saveAs(location))) return;
    }
  }

  runTabCommand(command: TabCommand): void {
    const closingLocations = this.untitledLocationsClosedBy(command);
    if (closingLocations.length === 0) {
      this.applyTabCommand(command);
      return;
    }
    this.ask(closingLocations, {
      proceed: (savedKeys) => this.applyTabCommand(withSavedKeys(command, savedKeys)),
      abandon: () => undefined,
    });
  }

  /** Resolves to true when the window may close, after the user saved or discarded new documents. */
  confirmClosingWindow(): Promise<boolean> {
    const locations = this.untitledLocations();
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

  /** The saved key of each document, or undefined as soon as the user cancels one Save dialog. */
  private async saveEach(locations: readonly DocumentLocation[]): Promise<Map<string, string> | undefined> {
    const savedKeys = new Map<string, string>();
    for (const location of locations) {
      const saved = await this.saveAs(location);
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

  private async saveAs(location: DocumentLocation): Promise<DocumentLocation | undefined> {
    try {
      return await this.session.saveDocumentAs(location.canonicalKey);
    } catch {
      this.callbacks.onSaveFailed(location.fileName);
      return undefined;
    }
  }

  private applyTabCommand(command: TabCommand): void {
    this.session.updateTabs((tabStrip) => applyTabCommand(tabStrip, command));
  }

  private untitledLocations(): DocumentLocation[] {
    return this.session
      .currentState()
      .tabStrip.tabs()
      .map((tab) => tab.location)
      .filter(isUntitledLocation);
  }

  private untitledLocationsClosedBy(command: TabCommand): DocumentLocation[] {
    const remainingTabs = applyTabCommand(this.session.currentState().tabStrip, command);
    return this.untitledLocations().filter((location) => !remainingTabs.isOpen(location.canonicalKey));
  }
}

/** A command aimed at a new document must now aim at the file it was saved as. */
function withSavedKeys(command: TabCommand, savedKeys: ReadonlyMap<string, string>): TabCommand {
  if (!('canonicalKey' in command)) return command;
  const savedKey = savedKeys.get(command.canonicalKey);
  return savedKey === undefined ? command : { ...command, canonicalKey: savedKey };
}
