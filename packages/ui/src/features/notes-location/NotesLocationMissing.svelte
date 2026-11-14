<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import type { ViewerCommand } from '../viewer/viewerCommands';

  interface Props {
    path: string;
    translator: Translator;
    onCommand: (command: ViewerCommand) => void;
  }

  const { path, translator, onCommand }: Props = $props();
</script>

<main class="notes-location-missing" aria-labelledby="notes-location-missing-heading">
  <h1 id="notes-location-missing-heading">{translator.translate('notes.missing.title')}</h1>
  <p>{translator.translate('notes.missing.message', { path })}</p>
  <div class="actions">
    <button type="button" onclick={() => onCommand({ kind: 'retryNotesLocation' })}>
      {translator.translate('notes.missing.tryAgain')}
    </button>
    <button type="button" onclick={() => onCommand({ kind: 'locateNotesLocation' })}>
      {translator.translate('notes.missing.locate')}
    </button>
    <button type="button" onclick={() => onCommand({ kind: 'chooseNotesLocation' })}>
      {translator.translate('notes.missing.chooseAnother')}
    </button>
  </div>
</main>

<style>
  .notes-location-missing {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    padding: 12vh max(var(--space-6), calc((100% - 40rem) / 2)) var(--space-8);
    background: var(--color-background);
    overflow-wrap: anywhere;
  }

  h1 {
    margin: 0 0 var(--space-3);
    font-size: 1.75rem;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  p {
    margin: 0 0 var(--space-4);
    color: var(--color-text-secondary);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
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

  button:focus-visible {
    outline: 2px solid var(--color-focus);
  }
</style>
