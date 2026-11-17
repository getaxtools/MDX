<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import Dialog from '../../components/Dialog.svelte';
  import type { ViewerCommand } from '../viewer/viewerCommands';
  import type { NoteImportView } from './NoteTransferActions';

  interface Props {
    view: NoteImportView;
    translator: Translator;
    onCommand: (command: ViewerCommand) => void;
  }

  const { view, translator, onCommand }: Props = $props();

  const report = $derived(view.report);
  const isRunning = $derived(report === undefined && view.failure === undefined);
</script>

<Dialog
  title={translator.translate('notes.import.title')}
  closeLabel={translator.translate(isRunning ? 'notes.import.runInBackground' : 'notes.import.close')}
  onClose={() => onCommand({ kind: 'closeNotesTransfer' })}
>
  {#if isRunning}
    <p role="status">
      {view.progress.isListing
        ? translator.translate('notes.import.listing', { total: view.progress.total })
        : translator.translate('notes.import.progress', {
            done: view.progress.done,
            total: view.progress.total,
          })}
    </p>
    <progress
      aria-label={translator.translate('notes.import.title')}
      value={view.progress.done}
      max={Math.max(view.progress.total, 1)}
    ></progress>
  {:else if view.failure}
    <p role="alert">{translator.translate(view.failure.messageKey, { path: view.failure.path })}</p>
  {:else if report}
    <p role="status">
      {translator.translate(report.wasCancelled ? 'notes.import.cancelledSummary' : 'notes.import.summary', {
        count: report.copiedFiles,
      })}
    </p>
    {#if report.renamedFiles.length > 0}
      <h3>{translator.translate('notes.import.renamedHeading')}</h3>
      <ul>
        {#each report.renamedFiles as renamed (renamed.wanted)}
          <li>
            {translator.translate('notes.import.renamed', {
              wanted: renamed.wanted,
              savedAs: renamed.savedAs,
            })}
          </li>
        {/each}
      </ul>
      {#if report.renamedNotListed > 0}
        <p>{translator.translate('notes.import.moreNotListed', { count: report.renamedNotListed })}</p>
      {/if}
    {/if}
    {#if report.unsupportedSyntax.length > 0}
      <h3>{translator.translate('notes.import.unsupportedHeading')}</h3>
      <ul>
        {#each report.unsupportedSyntax as syntax (`${syntax.note}:${String(syntax.line)}:${syntax.detail}`)}
          <li>
            {translator.translate(`notes.import.unsupported.${syntax.kind}`, {
              note: syntax.note,
              line: syntax.line,
              detail: syntax.detail,
            })}
          </li>
        {/each}
      </ul>
      {#if report.unsupportedNotListed > 0}
        <p>{translator.translate('notes.import.moreNotListed', { count: report.unsupportedNotListed })}</p>
      {/if}
    {:else}
      <p>{translator.translate('notes.import.allSupported')}</p>
    {/if}
    {#if report.failedFiles.length > 0}
      <h3>{translator.translate('notes.import.failedHeading')}</h3>
      <ul>
        {#each report.failedFiles as failed (failed)}
          <li>{failed}</li>
        {/each}
      </ul>
    {/if}
    {#if report.unreadableFolders.length > 0}
      <h3>{translator.translate('notes.import.unreadableHeading')}</h3>
      <ul>
        {#each report.unreadableFolders as folder (folder)}
          <li>{folder}</li>
        {/each}
      </ul>
    {/if}
    {#if report.skippedEntries > 0}
      <p>{translator.translate('notes.import.skipped', { count: report.skippedEntries })}</p>
    {/if}
  {/if}
  {#snippet footer()}
    {#if isRunning}
      <button onclick={() => onCommand({ kind: 'cancelNotesImport' })}>
        {translator.translate('notes.import.cancel')}
      </button>
    {/if}
  {/snippet}
</Dialog>

<style>
  h3 {
    margin: var(--space-3) 0 var(--space-1);
    font-size: var(--text-size-body);
  }

  ul {
    margin: 0;
    padding-inline-start: var(--space-5);
  }

  li {
    overflow-wrap: anywhere;
  }

  progress {
    width: 100%;
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

  button:focus-visible {
    outline: 2px solid var(--color-focus);
  }
</style>
