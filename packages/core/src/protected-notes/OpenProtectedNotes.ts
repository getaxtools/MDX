import { DocumentOpenError, isProtectedNoteLocation, type OpenedDocument } from '@mdx/platform';
import { withDocumentLineBreaks } from '../documents/lineEndings';

/** Writes a protected note's text, encrypted, into its section. */
export type ProtectedNoteSaver = (text: string) => Promise<void>;

interface OpenProtectedNote {
  readonly document: OpenedDocument;
  readonly saveText: ProtectedNoteSaver;
}

/** The protected notes open in tabs, held only in memory and only while their tabs are open. */
export class OpenProtectedNotes {
  private readonly notes = new Map<string, OpenProtectedNote>();

  add(document: OpenedDocument, saveText: ProtectedNoteSaver): void {
    if (!isProtectedNoteLocation(document.location)) {
      throw new DocumentOpenError('unreadable', document.location.displayPath);
    }
    this.notes.set(document.location.canonicalKey, { document, saveText });
  }

  has(canonicalKey: string): boolean {
    return this.notes.has(canonicalKey);
  }

  document(canonicalKey: string): OpenedDocument | undefined {
    return this.notes.get(canonicalKey)?.document;
  }

  /** Saves edited text in the note's own line breaks; text that was not read cleanly is refused. */
  async save(canonicalKey: string, editedText: string): Promise<void> {
    const note = this.notes.get(canonicalKey);
    if (!note) throw new DocumentOpenError('unreadable', canonicalKey);
    const { document } = note;
    if (document.hasDecodingErrors === true) {
      throw new DocumentOpenError('lossyDecoding', document.location.displayPath);
    }
    const text = withDocumentLineBreaks(editedText, document.lineEnding, document.text);
    await note.saveText(text);
    if (this.notes.get(canonicalKey) === note) {
      this.notes.set(canonicalKey, { ...note, document: { ...document, text } });
    }
  }

  /** Forgets the text of every note whose tab is no longer open. */
  keepOnly(isOpen: (canonicalKey: string) => boolean): void {
    for (const canonicalKey of this.notes.keys()) {
      if (!isOpen(canonicalKey)) this.notes.delete(canonicalKey);
    }
  }

  clear(): void {
    this.notes.clear();
  }
}
