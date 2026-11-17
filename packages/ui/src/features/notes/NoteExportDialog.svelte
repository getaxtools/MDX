<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import Dialog from '../../components/Dialog.svelte';
  import type { ViewerCommand } from '../viewer/viewerCommands';
  import type { NoteExportView } from './NoteTransferActions';

  interface Props {
    view: NoteExportView;
    translator: Translator;
    onCommand: (command: ViewerCommand) => void;
  }

  const { view, translator, onCommand }: Props = $props();

  const summary = $derived(view.summary);
  const canExport = $derived(view.destination !== undefined && !view.isExporting && summary === undefined);
</script>

<Dialog
  title={translator.translate('notes.export.title', { name: view.name })}
  closeLabel={translator.translate(summary ? 'notes.export.done' : 'notes.export.cancel')}
  onClose={() => onCommand({ kind: 'closeNotesTransfer' })}
>
  {#if summary}
    <p role="status">
      {translator.translate('notes.export.summary', { count: summary.exportedFiles, folder: summary.folder })}
    </p>
    {#if summary.attachmentsLeftOut > 0}
      <p>{translator.translate('notes.export.attachmentsLeftOut', { count: summary.attachmentsLeftOut })}</p>
    {/if}
    {#if summary.excludedLeftOut > 0}
      <p>{translator.translate('notes.export.excludedLeftOut', { count: summary.excludedLeftOut })}</p>
    {/if}
    {#if summary.failedFiles.length > 0}
      <p>{translator.translate('notes.export.failedFiles', { count: summary.failedFiles.length })}</p>
    {/if}
  {:else}
    <p>{translator.translate('notes.export.description')}</p>
    <div class="destination">
      <span id="notes-export-destination">
        {view.destination ?? translator.translate('notes.export.noFolder')}
      </span>
      <button
        aria-describedby="notes-export-destination"
        disabled={view.isExporting}
        onclick={() => onCommand({ kind: 'chooseNotesExportFolder' })}
      >
        {translator.translate('notes.export.chooseFolder')}
      </button>
    </div>
    {#if view.isDestinationRefused}
      <p role="alert">{translator.translate('notes.export.insideLocation')}</p>
    {/if}
    <label class="option">
      <input
        type="checkbox"
        checked={view.useRelativeLinks}
        disabled={view.isExporting}
        onchange={(event) =>
          onCommand({ kind: 'setNotesExportRelativeLinks', isOn: event.currentTarget.checked })}
      />
      {translator.translate('notes.export.relativeLinks')}
    </label>
    <p class="hint">{translator.translate('notes.export.relativeLinksHint')}</p>
    {#if view.existingFileCount !== undefined}
      <p role="alert">
        {translator.translate('notes.export.existingFiles', { count: view.existingFileCount })}
      </p>
    {/if}
    {#if view.failure}
      <p role="alert">{translator.translate(view.failure.messageKey, { path: view.failure.path })}</p>
    {/if}
  {/if}
  {#snippet footer()}
    {#if view.existingFileCount !== undefined && !summary}
      <button disabled={view.isExporting} onclick={() => onCommand({ kind: 'replaceExportedNotes' })}>
        {translator.translate('notes.export.replace')}
      </button>
    {:else if !summary}
      <button disabled={!canExport} onclick={() => onCommand({ kind: 'startNotesExport' })}>
        {translator.translate('notes.export.start')}
      </button>
    {/if}
  {/snippet}
</Dialog>

<style>
  .destination {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
    margin-block: var(--space-2);
  }

  .destination span {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    color: var(--color-text-secondary);
  }

  .option {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .hint {
    margin-block-start: var(--space-1);
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
  }

  button {
    min-height: 32px;
    padding: 0 var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-small);
    background: var(--color-surface-raised);
    color: var(--color-text);
    font: inherit;
  }

  button:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--color-focus);
  }
</style>
