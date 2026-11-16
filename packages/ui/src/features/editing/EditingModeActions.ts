import { isTooLargeForRichText, type EditingModeSetting, type ViewerSession } from '@mdx/core';
import type { MessageKey } from '@mdx/i18n';
import type { DocumentLocation } from '@mdx/platform';

/** A mode change to announce once to screen readers; the number tells one change from the next. */
export interface EditingModeAnnouncement {
  readonly mode: EditingModeSetting;
  readonly number: number;
}

export interface EditingModeCallbacks {
  readonly activeEditedLocation: () => DocumentLocation | undefined;
  readonly showNotice: (key: MessageKey, values: Readonly<Record<string, string | number>>) => void;
  readonly onChange: () => void;
}

const TOO_LARGE_NOTICE: MessageKey = 'editing.richTextTooLarge';

/** The editing mode setting, and the documents too large for Rich text that stay in Source. */
export class EditingModeActions {
  private latestAnnouncement: EditingModeAnnouncement | undefined;
  private readonly sizeChecks = new Map<string, { readonly text: string; readonly isTooLarge: boolean }>();

  constructor(
    private readonly session: ViewerSession,
    private readonly callbacks: EditingModeCallbacks,
  ) {}

  /** The mode a document is edited in: the setting, or Source for a document too large for Rich text. */
  modeFor(canonicalKey: string): EditingModeSetting {
    const mode = this.session.currentState().viewSettings.editingMode;
    return mode === 'richText' && this.isTooLarge(canonicalKey) ? 'source' : mode;
  }

  announcement(): EditingModeAnnouncement | undefined {
    return this.latestAnnouncement;
  }

  toggleMode(): void {
    const location = this.callbacks.activeEditedLocation();
    const shownMode = location ? this.modeFor(location.canonicalKey) : this.setting();
    this.changeMode(shownMode === 'richText' ? 'source' : 'richText');
  }

  /** Changes the setting for every editor, except that a document too large for Rich text refuses it. */
  changeMode(mode: EditingModeSetting): void {
    const location = this.callbacks.activeEditedLocation();
    if (mode === 'richText' && location && this.isTooLarge(location.canonicalKey)) {
      this.showTooLargeNotice(location);
      return;
    }
    if (mode === this.setting()) return;
    this.session.updateViewSettings((viewSettings) => ({ ...viewSettings, editingMode: mode }));
    this.latestAnnouncement = { mode, number: (this.latestAnnouncement?.number ?? 0) + 1 };
    this.callbacks.onChange();
  }

  /** A document that starts being edited in Source although the setting is Rich text says why. */
  explainSourceFor(location: DocumentLocation): void {
    if (this.setting() === 'richText' && this.isTooLarge(location.canonicalKey))
      this.showTooLargeNotice(location);
  }

  private setting(): EditingModeSetting {
    return this.session.currentState().viewSettings.editingMode;
  }

  private showTooLargeNotice(location: DocumentLocation): void {
    this.callbacks.showNotice(TOO_LARGE_NOTICE, { fileName: location.fileName });
  }

  /** Measured on the saved text, once per text, as the file's size decides it. */
  private isTooLarge(canonicalKey: string): boolean {
    const text = this.session.openedDocument(canonicalKey)?.text ?? '';
    const known = this.sizeChecks.get(canonicalKey);
    if (known?.text === text) return known.isTooLarge;
    const isTooLarge = isTooLargeForRichText(text);
    this.sizeChecks.set(canonicalKey, { text, isTooLarge });
    return isTooLarge;
  }
}
