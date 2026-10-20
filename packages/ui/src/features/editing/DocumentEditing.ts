import { withUnixLineBreaks } from '@mdx/core';

/** Which documents are open for editing, and their edited text while it differs from the saved file. */
export class DocumentEditing {
  private readonly editingKeys = new Set<string>();
  private readonly editedTexts = new Map<string, string>();

  isEditing(canonicalKey: string): boolean {
    return this.editingKeys.has(canonicalKey);
  }

  toggleEditing(canonicalKey: string): void {
    if (this.editingKeys.has(canonicalKey)) this.editingKeys.delete(canonicalKey);
    else this.editingKeys.add(canonicalKey);
  }

  /** The edited text, or undefined when the document has no unsaved changes. */
  editedTextOf(canonicalKey: string): string | undefined {
    return this.editedTexts.get(canonicalKey);
  }

  hasUnsavedChanges(canonicalKey: string): boolean {
    return this.editedTexts.has(canonicalKey);
  }

  unsavedKeys(): ReadonlySet<string> {
    return new Set(this.editedTexts.keys());
  }

  /** Records the editor's text; returns true when the document's unsaved state changed. */
  updateText(canonicalKey: string, text: string, savedText: string): boolean {
    const wasUnsaved = this.editedTexts.has(canonicalKey);
    if (text === withUnixLineBreaks(savedText)) this.editedTexts.delete(canonicalKey);
    else this.editedTexts.set(canonicalKey, text);
    return wasUnsaved !== this.editedTexts.has(canonicalKey);
  }

  discardChanges(canonicalKey: string): void {
    this.editedTexts.delete(canonicalKey);
  }

  /** Forgets documents whose tabs were closed, along with their unsaved text. */
  keepOnly(openKeys: ReadonlySet<string>): void {
    for (const key of [...this.editingKeys]) if (!openKeys.has(key)) this.editingKeys.delete(key);
    for (const key of [...this.editedTexts.keys()]) if (!openKeys.has(key)) this.editedTexts.delete(key);
  }

  /** Moves editing state to a new key, after Save As gave the document a file. */
  rename(fromKey: string, toKey: string): void {
    if (this.editingKeys.delete(fromKey)) this.editingKeys.add(toKey);
    this.editedTexts.delete(fromKey);
  }
}
