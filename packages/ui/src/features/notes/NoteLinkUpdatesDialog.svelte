<script lang="ts">
  import type { MessageKey, Translator } from '@mdx/i18n';
  import Dialog from '../../components/Dialog.svelte';
  import type { ViewerCommand } from '../viewer/viewerCommands';
  import type { LeftNoteReason, NoteLinkUpdatePreview } from './NoteLinkUpdateActions';

  interface Props {
    preview: NoteLinkUpdatePreview;
    translator: Translator;
    onCommand: (command: ViewerCommand) => void;
    /** Closing leaves the links as they are. */
    onClose: () => void;
  }

  const { preview, translator, onCommand, onClose }: Props = $props();

  const LEFT_NOTE_KEYS: Readonly<Record<LeftNoteReason, MessageKey>> = {
    unsaved: 'notes.linkUpdates.left.unsaved',
    encoding: 'notes.linkUpdates.left.encoding',
    notChangeableInPlace: 'notes.linkUpdates.left.notChangeableInPlace',
    noUniqueTarget: 'notes.linkUpdates.left.noUniqueTarget',
    tooManyLinks: 'notes.linkUpdates.left.tooManyLinks',
    changedSincePlanned: 'notes.linkUpdates.left.changed',
    unavailable: 'notes.linkUpdates.left.unavailable',
  };

  let isAlwaysApplied = $state(false);

  function updateLinks() {
    onCommand({ kind: 'applyNoteLinkUpdates', isAlwaysApplied });
  }
</script>

<Dialog
  title={translator.translate('notes.linkUpdates.title', { name: preview.noteName })}
  closeLabel={translator.translate('notes.linkUpdates.skip')}
  {onClose}
>
  <p class="description">
    {translator.translate('notes.linkUpdates.description', {
      links: preview.linkCount,
      notes: preview.noteCount,
    })}
  </p>
  {#if preview.mayMissLinks}
    <p class="description">{translator.translate('notes.linkUpdates.mayMissLinks')}</p>
  {/if}
  {#if preview.hasExcludedPaths}
    <p class="description">{translator.translate('notes.linkUpdates.excludedPaths')}</p>
  {/if}
  {#each preview.notes as note, index (note.path)}
    <section class="note" aria-labelledby="note-link-updates-{index}">
      <h3 id="note-link-updates-{index}">
        {note.name}
        {#if note.folder !== ''}
          <span class="folder"
            >{translator.translate('notes.linkUpdates.inFolder', { folder: note.folder })}</span
          >
        {/if}
      </h3>
      <ul>
        {#each note.lines as line (line.lineNumber)}
          <li>
            <span class="line-number">
              {translator.translate('notes.linkUpdates.line', { number: line.lineNumber })}
            </span>
            <span class="change">
              <span class="label">{translator.translate('notes.linkUpdates.before')}</span>
              <code>{line.before}</code>
            </span>
            <span class="change">
              <span class="label">{translator.translate('notes.linkUpdates.after')}</span>
              <code>{line.after}</code>
            </span>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
  {#if preview.hiddenLineCount > 0}
    <p class="description">
      {translator.translate('notes.linkUpdates.moreLines', { count: preview.hiddenLineCount })}
    </p>
  {/if}
  {#if preview.leftNotes.length > 0}
    <section class="note" aria-labelledby="note-link-updates-left">
      <h3 id="note-link-updates-left">{translator.translate('notes.linkUpdates.leftTitle')}</h3>
      <ul>
        {#each preview.leftNotes as note (`${note.path}:${note.reason}`)}
          <li>
            <span>{translator.translate(LEFT_NOTE_KEYS[note.reason], { name: note.name })}</span>
            {#if note.folder !== ''}
              <span class="folder"
                >{translator.translate('notes.linkUpdates.inFolder', { folder: note.folder })}</span
              >
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}
  {#snippet footer()}
    <label class="toggle">
      <input id="note-link-updates-always" type="checkbox" bind:checked={isAlwaysApplied} />
      {translator.translate('notes.linkUpdates.always')}
    </label>
    <button type="button" onclick={updateLinks}>
      {translator.translate('notes.linkUpdates.update')}
    </button>
  {/snippet}
</Dialog>

<style>
  .description {
    margin: 0 0 var(--space-3);
    color: var(--color-text-secondary);
  }

  .note {
    margin-bottom: var(--space-3);
  }

  h3 {
    margin: 0 0 var(--space-1);
    font-size: var(--text-size-body);
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .folder {
    margin-inline-start: var(--space-2);
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
    font-weight: 400;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: grid;
    gap: var(--space-1);
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--color-border);
  }

  .line-number,
  .label {
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
  }

  .change {
    display: flex;
    gap: var(--space-2);
    align-items: baseline;
  }

  .label {
    flex: none;
    min-width: 3.5rem;
  }

  code {
    padding: 0 var(--space-1);
    border-radius: var(--radius-medium);
    background: var(--color-code-background);
    font-family: var(--font-mono);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-inline-end: auto;
  }

  button {
    height: 32px;
    padding: 0 var(--space-4);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-medium);
    background: var(--color-surface-raised);
    color: var(--color-text);
    font: inherit;
    font-weight: 500;
  }

  button:hover {
    background: var(--color-surface-hover);
  }

  :is(button, input):focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
  }
</style>
