<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import ExplorerSectionHeader from '../explorer/ExplorerSectionHeader.svelte';
  import type { ViewerCommand } from '../viewer/viewerCommands';
  import type { ProtectedNotesView } from './ProtectedNotesActions';

  interface Props {
    view: ProtectedNotesView;
    translator: Translator;
    isExpanded: boolean;
    onToggleExpanded: () => void;
    activeDocumentKey?: string | undefined;
    onCommand: (command: ViewerCommand) => void;
  }

  const { view, translator, isExpanded, onToggleExpanded, activeDocumentKey, onCommand }: Props = $props();
</script>

<section class="protected-notes" aria-labelledby="protected-notes-heading">
  <ExplorerSectionHeader
    section="protectedNotes"
    headingId="protected-notes-heading"
    title={translator.translate('protectedNotes.section.title')}
    {isExpanded}
    onToggle={onToggleExpanded}
  >
    {#snippet status()}
      {#if view.state !== 'notSetUp'}
        <span class="status" class:unlocked={view.state === 'unlocked'}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect x="3.5" y="7" width="9" height="6.5" rx="1" />
            <path
              d={view.state === 'unlocked' ? 'M5.5 7V5a2.5 2.5 0 0 1 5-.6' : 'M5.5 7V5a2.5 2.5 0 0 1 5 0v2'}
            />
          </svg>
          {translator.translate(
            view.state === 'unlocked' ? 'protectedNotes.section.unlocked' : 'protectedNotes.section.locked',
          )}
        </span>
      {/if}
    {/snippet}
  </ExplorerSectionHeader>
  {#if isExpanded}
    <div class="body">
      {#if view.state === 'notSetUp'}
        <p class="explanation">{translator.translate('protectedNotes.section.notSetUp')}</p>
        <button class="action" onclick={() => onCommand({ kind: 'showProtectedSetUp' })}>
          {translator.translate('protectedNotes.section.protectNotes')}
        </button>
      {:else if view.state === 'unlocked'}
        {#if view.notes.length === 0}
          <p class="explanation">{translator.translate('protectedNotes.section.empty')}</p>
        {:else}
          <ul aria-labelledby="protected-notes-heading">
            {#each view.notes as note (note.noteId)}
              <li>
                <span
                  class="note"
                  aria-current={note.canonicalKey === activeDocumentKey ? 'page' : undefined}
                >
                  {note.title}
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    </div>
  {/if}
</section>

<style>
  .body {
    display: grid;
    gap: var(--space-2);
    padding: 0 var(--space-1) var(--space-2);
  }

  .status {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 2px;
    margin-inline-start: auto;
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
    font-weight: 400;
    text-transform: none;
  }

  .status.unlocked {
    color: var(--color-text);
  }

  .status svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.3;
    stroke-linecap: round;
  }

  .explanation {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
  }

  .action {
    justify-self: start;
    min-height: 28px;
    padding: 0 var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-medium);
    background: var(--color-surface-raised);
    color: var(--color-text);
    font: inherit;
  }

  .action:hover {
    background: var(--color-surface-hover);
  }

  .action:focus-visible {
    outline: 2px solid var(--color-focus);
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .note {
    display: block;
    padding: 2px var(--space-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
