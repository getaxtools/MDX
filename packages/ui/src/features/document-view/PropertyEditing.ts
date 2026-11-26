import {
  editFrontMatter,
  readEditableFrontMatter,
  withUnixLineBreaks,
  type EditableProperty,
  type FrontMatterEdit,
  type ViewerSession,
} from '@mdx/core';
import { isUntitledLocation, type DocumentLocation } from '@mdx/platform';
import { readFrontMatterProperties } from '@mdx/renderer';
import type { DocumentEditing } from '../editing/DocumentEditing';
import type { EditingActions } from '../editing/EditingActions';
import type { DocumentSaving } from '../saving/DocumentSaving';

/** How the properties panel lets a note's properties change: as fields, or only in the note's text. */
export type PropertiesEditability =
  { readonly kind: 'fields'; readonly properties: readonly EditableProperty[] } | { readonly kind: 'inNote' };

/** Whether the fields take changes now, wait for a property being written, or wait for the note to be saved. */
export type PropertyFieldsState = 'editable' | 'saving' | 'unsavedChanges';

export type PropertyEditOutcome =
  'saved' | 'unchanged' | 'notSaved' | 'stillSaving' | 'refusedUnsavedChanges' | 'refusedCannotEdit';

export interface PropertyEditingDependencies {
  readonly session: ViewerSession;
  readonly editing: DocumentEditing;
  readonly saving: DocumentSaving;
  readonly editingActions: EditingActions;
  /** Properties are edited in place only in notes of the shown Notes workspace. */
  readonly isNote: (location: DocumentLocation) => boolean;
}

/** Fields only for front matter that both the preview and the in-place edit read as simple. */
export function propertiesEditabilityOf(text: string, frontMatter: string): PropertiesEditability {
  const isSimpleForPreview = readFrontMatterProperties(frontMatter) !== undefined;
  const properties = isSimpleForPreview ? readEditableFrontMatter(text) : undefined;
  return properties ? { kind: 'fields', properties } : { kind: 'inNote' };
}

export function propertyFieldsStateOf(
  canonicalKey: string,
  unsavedKeys: ReadonlySet<string>,
  savingKey: string | undefined,
): PropertyFieldsState {
  if (savingKey === canonicalKey) return 'saving';
  return unsavedKeys.has(canonicalKey) ? 'unsavedChanges' : 'editable';
}

/** Changes one existing property of a saved note in its file, through the same save that the editor uses. */
export class PropertyEditing {
  private savingKey: string | undefined;

  constructor(private readonly dependencies: PropertyEditingDependencies) {}

  /** The note whose property is being written; its unsaved state is that edit, not the user's typing. */
  noteBeingSaved(): string | undefined {
    return this.savingKey;
  }

  async editProperty(canonicalKey: string, edit: FrontMatterEdit): Promise<PropertyEditOutcome> {
    if (this.savingKey !== undefined) return 'stillSaving';
    const { session, editing } = this.dependencies;
    if (editing.hasUnsavedChanges(canonicalKey)) return 'refusedUnsavedChanges';
    const document = session.openedDocument(canonicalKey);
    if (!document || !this.canEditPropertiesOf(document.location)) return 'refusedCannotEdit';
    const savedText = withUnixLineBreaks(document.text);
    const hasProperty = readEditableFrontMatter(savedText)?.some((property) => property.key === edit.key);
    const result = hasProperty === true ? editFrontMatter(savedText, edit) : undefined;
    if (result?.outcome !== 'edited') return 'refusedCannotEdit';
    if (result.text === savedText) return 'unchanged';
    return this.save(document.location, result.text, document.text);
  }

  private canEditPropertiesOf(location: DocumentLocation): boolean {
    return !isUntitledLocation(location) && this.dependencies.isNote(location);
  }

  /**
   * The open editor gets the new text before the file is written, so anything typed during a slow
   * save builds on it and a later Save cannot bring the old value back.
   */
  private async save(
    location: DocumentLocation,
    text: string,
    savedText: string,
  ): Promise<PropertyEditOutcome> {
    const { editing, editingActions, saving } = this.dependencies;
    this.savingKey = location.canonicalKey;
    try {
      editing.updateText(location.canonicalKey, text, savedText);
      editingActions.showCurrentTextInEditor(location.canonicalKey);
      return (await saving.saveUnsavedChanges(location)) ? 'saved' : 'notSaved';
    } finally {
      this.savingKey = undefined;
    }
  }
}
