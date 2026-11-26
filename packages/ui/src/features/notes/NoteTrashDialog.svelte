<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import type { NoteTrashEntry } from '@mdx/platform';
  import Dialog from '../../components/Dialog.svelte';
  import type { ViewerCommand } from '../viewer/viewerCommands';

  interface Props {
    entries: readonly NoteTrashEntry[];
    translator: Translator;
    onCommand: (command: ViewerCommand) => void;
    onClose: () => void;
  }

  const { entries, translator, onCommand, onClose }: Props = $props();

  let isConfirmingEmpty = $state(false);

  const deletedAt = $derived(
    new Intl.DateTimeFormat(translator.locale, { dateStyle: 'medium', timeStyle: 'short' }),
  );

  function placeOf(entry: NoteTrashEntry): string {
    const folders = entry.originalPath.split('/').slice(0, -1);
    return folders.length === 0
      ? translator.translate('notes.trash.placeTop')
      : translator.translate('notes.trash.place', { folder: folders.join(' › ') });
  }

  function emptyTrash() {
    isConfirmingEmpty = false;
    onCommand({ kind: 'emptyNoteTrash' });
  }
</script>

<Dialog
  title={translator.translate('notes.trash.title')}
  closeLabel={translator.translate('dialog.close.label')}
  closeTooltip={translator.translate('dialog.close.tooltip')}
  isInformational
  {onClose}
>
  <p class="description">{translator.translate('notes.trash.description')}</p>
  {#if entries.length === 0}
    <p class="empty">{translator.translate('notes.trash.empty')}</p>
  {:else}
    <ul class="entries">
      {#each entries as entry (entry.id)}
        <li>
          <div class="entry">
            <span class="name">{entry.name}</span>
            <span class="details">
              {placeOf(entry)} ·
              {translator.translate('notes.trash.deletedAt', { date: deletedAt.format(entry.deletedAtMs) })}
              {#if entry.hasChildNotes}
                · {translator.translate('notes.trash.withChildNotes')}
              {/if}
            </span>
          </div>
          <button
            aria-label={translator.translate('notes.trash.restoreLabel', { name: entry.name })}
            onclick={() => onCommand({ kind: 'restoreNote', entryId: entry.id })}
          >
            {translator.translate('notes.trash.restore')}
          </button>
        </li>
      {/each}
    </ul>
    <div
      class="empty-trash"
      role="group"
      aria-labelledby={isConfirmingEmpty ? 'note-trash-empty-question' : undefined}
    >
      {#if isConfirmingEmpty}
        <p id="note-trash-empty-question">{translator.translate('notes.trash.emptyConfirm')}</p>
        <button class="danger" onclick={emptyTrash}
          >{translator.translate('notes.trash.emptyConfirmButton')}</button
        >
        <button onclick={() => (isConfirmingEmpty = false)}
          >{translator.translate('notes.trash.cancel')}</button
        >
      {:else}
        <button onclick={() => (isConfirmingEmpty = true)}
          >{translator.translate('notes.trash.emptyTrash')}</button
        >
      {/if}
    </div>
  {/if}
</Dialog>

<style>
  .description,
  .empty {
    margin: 0 0 var(--space-3);
    color: var(--color-text-secondary);
  }

  .entries {
    margin: 0 0 var(--space-3);
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--color-border);
  }

  .entry {
    display: grid;
    min-width: 0;
  }

  .name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .details {
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
  }

  .empty-trash {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }

  .empty-trash p {
    flex-basis: 100%;
    margin: 0;
  }

  button {
    flex: none;
    height: 32px;
    padding: 0 var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-medium);
    background: var(--color-surface-raised);
    color: var(--color-text);
    font: inherit;
  }

  button.danger {
    border-color: var(--color-alert-caution);
  }

  button:focus-visible {
    outline: 2px solid var(--color-focus);
  }
</style>
