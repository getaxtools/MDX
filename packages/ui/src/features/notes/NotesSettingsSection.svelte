<script lang="ts">
  import {
    MAX_EXCLUDED_PATHS,
    excludedPathsFromLines,
    isValidFolderSetting,
    isValidNameFormat,
    type NotesSettings,
  } from '@mdx/core';
  import type { MessageKey, Translator } from '@mdx/i18n';
  import type { ViewerCommand } from '../viewer/viewerCommands';

  interface Props {
    folder: string;
    settings: NotesSettings;
    isDeletionConfirmed: boolean;
    translator: Translator;
    onCommand: (command: ViewerCommand) => void;
  }

  const { folder, settings, isDeletionConfirmed, translator, onCommand }: Props = $props();

  type TextField = 'dailyFolder' | 'dailyNameFormat' | 'templatesFolder' | 'dailyTemplate';

  interface FieldDefinition {
    readonly field: TextField;
    readonly labelKey: MessageKey;
    readonly descriptionKey?: MessageKey;
    readonly problemKey?: MessageKey;
    readonly isValid: (value: string) => boolean;
  }

  const FIELDS: readonly FieldDefinition[] = [
    {
      field: 'dailyFolder',
      labelKey: 'settings.notes.dailyFolder',
      problemKey: 'settings.notes.invalidFolder',
      isValid: isValidFolderSetting,
    },
    {
      field: 'dailyNameFormat',
      labelKey: 'settings.notes.dailyNameFormat',
      descriptionKey: 'settings.notes.dailyNameFormatDescription',
      problemKey: 'settings.notes.invalidFormat',
      isValid: isValidNameFormat,
    },
    {
      field: 'templatesFolder',
      labelKey: 'settings.notes.templatesFolder',
      problemKey: 'settings.notes.invalidFolder',
      isValid: isValidFolderSetting,
    },
    {
      field: 'dailyTemplate',
      labelKey: 'settings.notes.dailyTemplate',
      descriptionKey: 'settings.notes.dailyTemplateDescription',
      isValid: (value) => value === '' || isValidNameFormat(value),
    },
  ];

  let invalidFields: ReadonlySet<TextField> = $state(new Set());

  function save(definition: FieldDefinition, value: string) {
    const isValid = definition.isValid(value);
    const others = [...invalidFields].filter((field) => field !== definition.field);
    invalidFields = new Set(isValid ? others : [...others, definition.field]);
    if (!isValid) return;
    const { dailyTemplate, ...folders } = { ...settings, [definition.field]: value };
    onCommand({
      kind: 'updateNotesSettings',
      settings: { ...folders, ...(dailyTemplate ? { dailyTemplate } : {}) },
    });
  }

  let hasInvalidExcludedPaths = $state(false);

  function saveExcludedPaths(text: string) {
    const excludedPaths = excludedPathsFromLines(text);
    hasInvalidExcludedPaths = excludedPaths === undefined;
    if (excludedPaths) onCommand({ kind: 'updateNotesSettings', settings: { ...settings, excludedPaths } });
  }

  function describedBy(definition: FieldDefinition): string | undefined {
    const ids = [
      definition.descriptionKey ? `settings-notes-${definition.field}-description` : undefined,
      invalidFields.has(definition.field) ? `settings-notes-${definition.field}-problem` : undefined,
    ].filter((id) => id !== undefined);
    return ids.length > 0 ? ids.join(' ') : undefined;
  }
</script>

<section aria-labelledby="settings-section-notes">
  <h3 id="settings-section-notes">{translator.translate('settings.section.notes')}</h3>
  <div class="setting">
    <span class="label" id="settings-notes-folder-label">{translator.translate('settings.notes.folder')}</span
    >
    <button
      class="beside-label"
      aria-describedby="settings-notes-folder-label settings-notes-folder"
      onclick={() => onCommand({ kind: 'revealInFileManager', path: folder })}
    >
      {translator.translate('settings.notes.openInFileExplorer')}
    </button>
    <p id="settings-notes-folder" class="description"><code>{folder}</code></p>
    <p class="description">{translator.translate('settings.notes.description')}</p>
  </div>
  {#each FIELDS as definition (definition.field)}
    <div class="setting">
      <label for="settings-notes-{definition.field}">{translator.translate(definition.labelKey)}</label>
      <input
        id="settings-notes-{definition.field}"
        value={settings[definition.field] ?? ''}
        aria-invalid={invalidFields.has(definition.field)}
        aria-describedby={describedBy(definition)}
        onchange={(event) => save(definition, event.currentTarget.value.trim())}
      />
      {#if definition.descriptionKey}
        <p id="settings-notes-{definition.field}-description" class="description">
          {translator.translate(definition.descriptionKey)}
        </p>
      {/if}
      {#if definition.problemKey && invalidFields.has(definition.field)}
        <p id="settings-notes-{definition.field}-problem" class="description problem" role="alert">
          {translator.translate(definition.problemKey)}
        </p>
      {/if}
    </div>
  {/each}
  <div class="setting">
    <label for="settings-notes-excluded-paths">{translator.translate('settings.notes.excludedPaths')}</label>
    <textarea
      id="settings-notes-excluded-paths"
      rows="3"
      spellcheck="false"
      value={settings.excludedPaths.join('\n')}
      aria-invalid={hasInvalidExcludedPaths}
      aria-describedby={hasInvalidExcludedPaths
        ? 'settings-notes-excluded-paths-description settings-notes-excluded-paths-problem'
        : 'settings-notes-excluded-paths-description'}
      onchange={(event) => saveExcludedPaths(event.currentTarget.value)}></textarea>
    <p id="settings-notes-excluded-paths-description" class="description">
      {translator.translate('settings.notes.excludedPathsDescription')}
    </p>
    {#if hasInvalidExcludedPaths}
      <p id="settings-notes-excluded-paths-problem" class="description problem" role="alert">
        {translator.translate('settings.notes.invalidExcludedPaths', { count: MAX_EXCLUDED_PATHS })}
      </p>
    {/if}
  </div>
  <div class="setting">
    <label class="toggle">
      <input
        id="settings-notes-confirm-deletion"
        type="checkbox"
        aria-describedby="settings-notes-confirm-deletion-description"
        checked={isDeletionConfirmed}
        onchange={() => onCommand({ kind: 'toggleNoteDeletionConfirmation' })}
      />
      {translator.translate('settings.notes.confirmDeletion')}
    </label>
    <p id="settings-notes-confirm-deletion-description" class="description">
      {translator.translate('settings.notes.confirmDeletionDescription')}
    </p>
  </div>
</section>

<style>
  h3 {
    margin: var(--space-4) 0 var(--space-2);
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
    font-weight: 600;
  }

  .setting {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0 var(--space-4);
    align-items: center;
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--color-border);
  }

  .toggle {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    grid-column: 1 / -1;
  }

  .description {
    grid-column: 1 / -1;
    margin: var(--space-1) 0 0;
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
  }

  .problem {
    color: var(--color-text);
  }

  input:not([type='checkbox']),
  textarea {
    width: 16rem;
    height: 32px;
    padding: 0 var(--space-2);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-medium);
    background: var(--color-background);
    color: var(--color-text);
    font: inherit;
  }

  textarea {
    height: auto;
    padding: var(--space-1) var(--space-2);
    resize: vertical;
  }

  :is(input, textarea)[aria-invalid='true'] {
    border-color: var(--color-alert-caution);
  }

  button {
    justify-self: start;
    height: 32px;
    padding: 0 var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-medium);
    background: var(--color-surface-raised);
    color: var(--color-text);
    font: inherit;
  }

  button:hover {
    background: var(--color-surface-hover);
  }

  input[type='checkbox'] {
    accent-color: var(--color-accent);
  }

  :is(input, textarea, button):focus-visible {
    outline: 2px solid var(--color-focus);
  }
</style>
