<script lang="ts">
  import type { ViewSettings } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import { tooltipWithShortcut } from '../shortcuts/commandShortcuts';
  import type { ViewerCommand } from '../viewer/viewerCommands';
  import ViewOptions from './ViewOptions.svelte';

  interface Props {
    viewSettings: ViewSettings;
    hasDocument: boolean;
    canBeFavourite: boolean;
    isFavourite: boolean;
    isEditing: boolean;
    translator: Translator;
    onCommand: (command: ViewerCommand) => void;
  }

  const { viewSettings, hasDocument, canBeFavourite, isFavourite, isEditing, translator, onCommand }: Props =
    $props();

  const openCommand: ViewerCommand = { kind: 'openDocuments' };
  const favouriteCommand: ViewerCommand = { kind: 'toggleFavourite' };
  const editingCommand: ViewerCommand = { kind: 'toggleEditing' };
  const previewBesideCommand: ViewerCommand = { kind: 'togglePreviewBesideEditor' };

  const openLabel = $derived(translator.translate('toolbar.open'));
  const favouriteLabel = $derived(translator.translate('favourites.toggle'));
  const editingLabel = $derived(translator.translate(isEditing ? 'toolbar.preview' : 'toolbar.edit'));
  const previewBesideLabel = $derived(translator.translate('toolbar.previewBeside'));
</script>

<div class="toolbar" role="toolbar" aria-label={translator.translate('toolbar.label')}>
  <button
    aria-label={openLabel}
    title={tooltipWithShortcut(openLabel, openCommand, translator)}
    onclick={() => onCommand(openCommand)}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.5 18V6.5A1.5 1.5 0 0 1 5 5h4l2 2h6.5A1.5 1.5 0 0 1 19 8.5V10" />
      <path d="M3.5 18l2.6-6.9A1.5 1.5 0 0 1 7.5 10h13l-2.8 7.4a1 1 0 0 1-.9.6z" />
    </svg>
  </button>
  <button
    class="favourite"
    aria-label={favouriteLabel}
    aria-pressed={isFavourite}
    title={tooltipWithShortcut(favouriteLabel, favouriteCommand, translator)}
    disabled={!canBeFavourite}
    onclick={() => onCommand(favouriteCommand)}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4l2.4 5 5.4.7-4 3.8 1 5.4-4.8-2.6-4.8 2.6 1-5.4-4-3.8 5.4-.7z" />
    </svg>
  </button>
  <span class="separator" aria-hidden="true"></span>
  <button
    class="labelled"
    aria-label={editingLabel}
    aria-pressed={isEditing}
    title={tooltipWithShortcut(editingLabel, editingCommand, translator)}
    disabled={!hasDocument}
    onclick={() => onCommand(editingCommand)}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {#if isEditing}
        <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
        <circle cx="12" cy="12" r="2.75" />
      {:else}
        <path d="M4.5 19.5h3.8L19 8.8 15.2 5 4.5 15.7z" />
        <path d="M13.2 7l3.8 3.8" />
      {/if}
    </svg>
    <span aria-hidden="true">{editingLabel}</span>
  </button>
  <button
    aria-label={previewBesideLabel}
    aria-pressed={viewSettings.isPreviewBesideEditor}
    title={tooltipWithShortcut(previewBesideLabel, previewBesideCommand, translator)}
    disabled={!hasDocument}
    onclick={() => onCommand(previewBesideCommand)}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M12 5v14" />
    </svg>
  </button>
  <span class="separator" aria-hidden="true"></span>
  <ViewOptions settings={viewSettings} {translator} {onCommand} />
</div>

<style>
  .toolbar {
    display: flex;
    flex: 0 1 auto;
    flex-wrap: wrap;
    gap: 2px;
    align-items: center;
    justify-content: flex-end;
    min-width: 0;
  }

  button {
    display: flex;
    gap: var(--space-1);
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 28px;
    padding: 0 var(--space-1);
    border: 0;
    border-radius: var(--radius-small);
    background: none;
    color: var(--color-text-secondary);
    font: inherit;
    font-size: var(--text-size-body);
    transition:
      background-color var(--motion-fast) ease-out,
      color var(--motion-fast) ease-out;
  }

  button.labelled {
    padding-inline-end: var(--space-2);
  }

  button:hover:not(:disabled) {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  button[aria-pressed='true'] {
    background: var(--color-surface-selected);
    color: var(--color-accent);
  }

  button:disabled {
    color: var(--color-text-tertiary);
  }

  button:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: -2px;
  }

  .favourite[aria-pressed='true'] {
    background: none;
  }

  .favourite[aria-pressed='true'] svg {
    fill: currentcolor;
  }

  .separator {
    width: 1px;
    height: 16px;
    margin: 0 var(--space-1);
    background: var(--color-border);
  }

  svg {
    flex: none;
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentcolor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.6;
  }
</style>
