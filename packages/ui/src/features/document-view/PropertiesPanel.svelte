<script lang="ts">
  import type { FrontMatterEdit } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import { readFrontMatterProperties } from '@mdx/renderer';
  import type { ViewerCommand } from '../viewer/viewerCommands';
  import PropertyField from './PropertyField.svelte';
  import type { PropertiesEditability, PropertyFieldsState } from './PropertyEditing';
  import { canEditInField, propertyFieldText } from './propertyFieldEdits';

  interface Props {
    frontMatter: string;
    canonicalKey?: string;
    /** Absent where properties are only shown, outside the notes of a Notes workspace. */
    editability?: PropertiesEditability | undefined;
    /** Fields take no changes while a property is written or an editor holds unsaved changes. */
    fieldsState?: PropertyFieldsState;
    translator: Translator;
    onCommand?: (command: ViewerCommand) => void;
  }

  const {
    frontMatter,
    canonicalKey = '',
    editability,
    fieldsState = 'editable',
    translator,
    onCommand = () => undefined,
  }: Props = $props();

  const idPrefix = $props.id();
  const hintId = `${idPrefix}-hint`;
  const properties = $derived(readFrontMatterProperties(frontMatter));
  const canEditInNote = $derived(
    editability?.kind === 'inNote' ||
      (editability?.kind === 'fields' && !editability.properties.every(canEditInField)),
  );
</script>

<details class="properties">
  <summary>{translator.translate('document.properties.title')}</summary>
  {#if editability?.kind === 'fields'}
    <p id={hintId} class="hint">
      {translator.translate(
        fieldsState === 'unsavedChanges'
          ? 'document.properties.unsavedChanges'
          : 'document.properties.fieldHint',
      )}
    </p>
    <dl>
      {#each editability.properties as property, index (property.key)}
        {#if canEditInField(property)}
          <dt><label for="{idPrefix}-{index}">{property.key}</label></dt>
          <dd>
            <PropertyField
              id="{idPrefix}-{index}"
              {property}
              isReadOnly={fieldsState !== 'editable'}
              describedBy={hintId}
              onEdit={(edit: FrontMatterEdit) => onCommand({ kind: 'editProperty', canonicalKey, edit })}
            />
          </dd>
        {:else}
          <dt>{property.key}</dt>
          <dd>
            <span dir="auto">{propertyFieldText(property)}</span>
            <span class="reason">
              {translator.translate('document.properties.listWithComma')}
            </span>
          </dd>
        {/if}
      {/each}
    </dl>
  {:else if properties}
    <dl>
      {#each properties as property, index (index)}
        <dt>{property.name}</dt>
        <dd>{property.values.join(', ')}</dd>
      {/each}
    </dl>
  {:else}
    <pre>{frontMatter}</pre>
  {/if}
  {#if canEditInNote}
    <button type="button" class="edit-in-note" onclick={() => onCommand({ kind: 'editPropertiesInNote' })}>
      {translator.translate('document.properties.editInNote')}
    </button>
  {/if}
</details>

<style>
  .properties {
    max-width: var(--reading-measure);
    margin: var(--space-4) auto 0;
    padding: var(--space-2) var(--space-6);
    box-sizing: border-box;
    font-size: var(--text-size-body);
    color: var(--color-text-secondary);
  }

  summary {
    cursor: default;
    font-weight: 600;
  }

  summary:focus-visible {
    outline: 2px solid var(--color-focus);
  }

  .hint {
    margin: var(--space-2) 0 0;
    font-size: var(--text-size-small);
  }

  .reason {
    display: block;
    font-size: var(--text-size-small);
    color: var(--color-text-secondary);
  }

  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    align-items: baseline;
    gap: var(--space-1) var(--space-4);
    margin: var(--space-2) 0 0;
  }

  dt {
    font-weight: 600;
  }

  dd {
    margin: 0;
    color: var(--color-text);
    overflow-wrap: anywhere;
  }

  pre {
    margin: var(--space-2) 0 0;
    font-family: var(--font-mono);
    white-space: pre-wrap;
  }

  .edit-in-note {
    margin-block-start: var(--space-2);
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-medium);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
  }

  .edit-in-note:hover {
    background: var(--color-surface-hover);
  }

  .edit-in-note:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 1px;
  }
</style>
