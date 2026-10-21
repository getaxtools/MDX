import { withUnixLineBreaks, type ViewerSession } from '@mdx/core';
import type { EditorMenuCommand } from '@mdx/editor';
import { isUntitledLocation, type DocumentLocation } from '@mdx/platform';
import type { DocumentEditing } from './DocumentEditing';
import type { EditorRequest } from './editingCommands';

export interface EditingCallbacks {
  /** Editing state changed in a way the window shows, such as a tab's unsaved dot. */
  readonly onChange: () => void;
  /** A document with unsaved changes was changed on disk by another program. */
  readonly onConflict: (location: DocumentLocation) => void;
}

/** Switching documents between preview and editing, and keeping edits and files in step. */
export class EditingActions {
  private lastRequestId = 0;
  /** The latest request per document, so a batch of reloads cannot hide one document's new text. */
  private readonly requests = new Map<string, EditorRequest>();

  constructor(
    private readonly session: ViewerSession,
    private readonly editing: DocumentEditing,
    private readonly callbacks: EditingCallbacks,
  ) {}

  /** The latest request for the active document's editor. */
  editorRequest(): EditorRequest | undefined {
    const key = this.activeLocation()?.canonicalKey;
    return key === undefined ? undefined : this.requests.get(key);
  }

  isActiveDocumentEditing(): boolean {
    const key = this.activeLocation()?.canonicalKey;
    return key !== undefined && this.editing.isEditing(key);
  }

  /** Opens the active document in the editor unless it is already there. */
  startEditingActiveDocument(): void {
    const location = this.activeLocation();
    if (!location || this.editing.isEditing(location.canonicalKey)) return;
    this.editing.toggleEditing(location.canonicalKey);
    this.callbacks.onChange();
  }

  toggleActiveDocument(): void {
    const location = this.activeLocation();
    if (!location) return;
    this.editing.toggleEditing(location.canonicalKey);
    this.callbacks.onChange();
  }

  /** Records the editor's text; the window updates only when the document's unsaved state flips. */
  updateText(canonicalKey: string, text: string): void {
    const savedText = this.session.openedDocument(canonicalKey)?.text ?? '';
    if (this.editing.updateText(canonicalKey, text, savedText)) this.callbacks.onChange();
  }

  /** Sends a menu command to the editor; false when the active document is not being edited. */
  runEditorCommand(command: EditorMenuCommand): boolean {
    const location = this.activeLocation();
    if (!location || !this.editing.isEditing(location.canonicalKey)) return false;
    this.requests.set(location.canonicalKey, {
      id: this.nextRequestId(),
      canonicalKey: location.canonicalKey,
      kind: 'command',
      command,
    });
    this.callbacks.onChange();
    return true;
  }

  revertActiveDocument(): Promise<void> {
    const location = this.activeLocation();
    return location ? this.reloadFromDisk(location.canonicalKey) : Promise.resolve();
  }

  /** Drops the unsaved changes of a document and shows the file as it is on disk now. */
  async reloadFromDisk(canonicalKey: string): Promise<void> {
    const location = this.session.openedDocument(canonicalKey)?.location;
    if (!location) return;
    this.editing.discardChanges(canonicalKey);
    if (!isUntitledLocation(location)) await this.session.reloadDocuments([location.displayPath]);
    this.replaceEditorText(canonicalKey);
  }

  /** After live reload: keep edits that match the file, ask about conflicting ones, refresh the rest. */
  handleReloadedDocuments(canonicalKeys: readonly string[]): void {
    for (const canonicalKey of canonicalKeys) {
      const document = this.session.openedDocument(canonicalKey);
      const editedText = this.editing.editedTextOf(canonicalKey);
      if (!document) {
        this.warnAboutUnreadableEditedDocument(canonicalKey);
        continue;
      }
      if (editedText === undefined) {
        if (this.editing.isEditing(canonicalKey)) this.replaceEditorText(canonicalKey);
      } else if (editedText === withUnixLineBreaks(document.text)) {
        this.editing.discardChanges(canonicalKey);
      } else {
        this.callbacks.onConflict(document.location);
      }
    }
    this.callbacks.onChange();
  }

  /** The file of a document with unsaved edits could not be read again, perhaps deleted or locked. */
  private warnAboutUnreadableEditedDocument(canonicalKey: string): void {
    if (!this.editing.hasUnsavedChanges(canonicalKey)) return;
    const location = this.session
      .currentState()
      .tabStrip.tabs()
      .find((tab) => tab.location.canonicalKey === canonicalKey)?.location;
    if (location) this.callbacks.onConflict(location);
  }

  private replaceEditorText(canonicalKey: string): void {
    const text = withUnixLineBreaks(this.session.openedDocument(canonicalKey)?.text ?? '');
    this.requests.set(canonicalKey, { id: this.nextRequestId(), canonicalKey, kind: 'replaceText', text });
    this.callbacks.onChange();
  }

  private nextRequestId(): number {
    this.lastRequestId += 1;
    return this.lastRequestId;
  }

  private activeLocation(): DocumentLocation | undefined {
    return this.session.currentState().tabStrip.activeTab()?.location;
  }
}
