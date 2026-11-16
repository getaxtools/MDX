<script lang="ts">
  import type { EditableProperty, FrontMatterEdit } from '@mdx/core';
  import { propertyFieldEdit, propertyFieldText } from './propertyFieldEdits';

  interface Props {
    id: string;
    property: EditableProperty;
    /** True while the field takes no changes; it stays focusable so its reason can be heard. */
    isReadOnly: boolean;
    /** The id of the text saying how to save the field, or why it takes no changes. */
    describedBy: string;
    onEdit: (edit: FrontMatterEdit) => void;
  }

  const { id, property, isReadOnly, describedBy, onEdit }: Props = $props();

  const savedText = $derived(propertyFieldText(property));

  function saveOrUndo(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
    if (event.isComposing || isReadOnly) return;
    const input = event.currentTarget;
    if (event.key === 'Enter') {
      event.preventDefault();
      const edit = propertyFieldEdit(property, input.value);
      if (edit) onEdit(edit);
    } else if (event.key === 'Escape' && input.value !== savedText) {
      event.preventDefault();
      event.stopPropagation();
      input.value = savedText;
    }
  }

  /** Only Enter saves, so leaving a field shows the file's value again. */
  function showSavedValue(event: FocusEvent & { currentTarget: HTMLInputElement }) {
    event.currentTarget.value = savedText;
  }
</script>

<input
  {id}
  class="property-field"
  type="text"
  dir="auto"
  value={savedText}
  readonly={isReadOnly}
  aria-disabled={isReadOnly ? 'true' : undefined}
  aria-describedby={describedBy}
  onkeydown={saveOrUndo}
  onblur={showSavedValue}
/>

<style>
  .property-field {
    inline-size: 100%;
    box-sizing: border-box;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-small);
    background: var(--color-background);
    color: var(--color-text);
    font: inherit;
  }

  .property-field:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 1px;
  }

  .property-field[aria-disabled='true'] {
    border-color: var(--color-border);
    color: var(--color-text-secondary);
  }

  @media (forced-colors: active) {
    .property-field[aria-disabled='true'] {
      color: GrayText;
    }
  }
</style>
