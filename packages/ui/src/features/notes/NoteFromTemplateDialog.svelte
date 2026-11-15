<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import { untrack } from 'svelte';
  import Dialog from '../../components/Dialog.svelte';
  import type { ViewerCommand } from '../viewer/viewerCommands';

  interface Props {
    templates: readonly string[];
    /** Where templates are looked for, to say so when there are none. */
    templatesFolder: string;
    translator: Translator;
    onCommand: (command: ViewerCommand) => void;
    onClose: () => void;
  }

  const { templates, templatesFolder, translator, onCommand, onClose }: Props = $props();

  let template = $state(untrack(() => templates[0] ?? ''));
  let name = $state('');
  let nameInput: HTMLInputElement | undefined = $state();

  $effect(() => nameInput?.focus());

  function create(event: SubmitEvent) {
    event.preventDefault();
    if (template === '' || name.trim() === '') return;
    onCommand({ kind: 'createNoteFromTemplate', template, name: name.trim() });
    onClose();
  }
</script>

<Dialog
  title={translator.translate('notes.templates.title')}
  closeLabel={translator.translate('notes.templates.cancel')}
  {onClose}
>
  {#if templates.length === 0}
    <p class="description">
      {translator.translate('notes.templates.none', { folder: templatesFolder })}
    </p>
  {:else}
    <form onsubmit={create}>
      <label for="note-template">{translator.translate('notes.templates.template')}</label>
      <select id="note-template" bind:value={template}>
        {#each templates as name (name)}
          <option value={name}>{name}</option>
        {/each}
      </select>
      <label for="note-from-template-name">{translator.translate('notes.templates.name')}</label>
      <input id="note-from-template-name" bind:this={nameInput} bind:value={name} />
      <div class="actions">
        <button type="submit" disabled={name.trim() === ''}>
          {translator.translate('notes.templates.create')}
        </button>
      </div>
    </form>
  {/if}
</Dialog>

<style>
  form {
    display: grid;
    gap: var(--space-2);
  }

  .description {
    margin: 0;
    color: var(--color-text-secondary);
  }

  input,
  select {
    height: 32px;
    padding: 0 var(--space-2);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-medium);
    background: var(--color-background);
    color: var(--color-text);
    font: inherit;
  }

  .actions {
    display: flex;
    gap: var(--space-2);
  }

  button {
    height: 32px;
    padding: 0 var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-medium);
    background: var(--color-surface-raised);
    color: var(--color-text);
    font: inherit;
  }

  :is(input, select, button):focus-visible {
    outline: 2px solid var(--color-focus);
  }
</style>
