<script lang="ts">
  import type { MessageKey, Translator } from '@mdx/i18n';
  import type { ProtectedFolderWarning } from '@mdx/platform';
  import ExplorerSectionHeader from '../explorer/ExplorerSectionHeader.svelte';
  import { shortcutLabelFor, tooltipWithShortcut } from '../shortcuts/commandShortcuts';
  import type { ViewerCommand } from '../viewer/viewerCommands';
  import type { ProtectedNotesView } from './ProtectedNotesActions';
  import ProtectedUnlockPanel from './ProtectedUnlockPanel.svelte';

  interface Props {
    view: ProtectedNotesView;
    translator: Translator;
    isExpanded: boolean;
    onToggleExpanded: () => void;
    activeDocumentKey?: string | undefined;
    onCommand: (command: ViewerCommand) => void;
  }

  const { view, translator, isExpanded, onToggleExpanded, activeDocumentKey, onCommand }: Props = $props();

  const FOLDER_WARNINGS: Record<ProtectedFolderWarning, MessageKey> = {
    olderNotes: 'protectedNotes.folderWarning.olderNotes',
    changedVault: 'protectedNotes.folderWarning.changedVault',
    checkUnavailable: 'protectedNotes.folderWarning.checkUnavailable',
  };

  const lockLabel = $derived(translator.translate('protectedNotes.lock.command'));
  const lockTooltip = $derived(
    tooltipWithShortcut(lockLabel, shortcutLabelFor({ kind: 'lockProtectedNotes' }, translator)),
  );

  let isCreating = $state(false);
  let newTitle = $state('');

  function startCreating() {
    if (!isExpanded) onToggleExpanded();
    newTitle = '';
    isCreating = true;
  }

  /** Enter creates the note and Escape gives up, as when naming a note in the note tree. */
  function handleTitleKeydown(event: KeyboardEvent) {
    if (event.isComposing || (event.key !== 'Enter' && event.key !== 'Escape')) return;
    event.preventDefault();
    event.stopPropagation();
    isCreating = false;
    if (event.key === 'Enter' && newTitle.trim() !== '') {
      onCommand({ kind: 'createProtectedNote', title: newTitle });
    }
  }

  function focusOnShow(element: HTMLElement) {
    element.focus();
  }
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
    {#snippet actions()}
      {#if view.state === 'unlocked'}
        <button
          class="header-action"
          aria-label={lockLabel}
          title={lockTooltip}
          onclick={() => onCommand({ kind: 'lockProtectedNotes' })}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect x="3.5" y="7" width="9" height="6.5" rx="1" />
            <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
          </svg>
        </button>
      {/if}
      {#if view.state === 'unlocked' && view.folderWarning === undefined}
        <button
          class="header-action"
          aria-label={translator.translate('protectedNotes.section.newNote')}
          title={translator.translate('protectedNotes.section.newNote')}
          onclick={startCreating}
        >
          <span aria-hidden="true">+</span>
        </button>
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
      {:else if view.state === 'locked'}
        <ProtectedUnlockPanel {view} {translator} {onCommand} />
      {:else if view.folderWarning}
        <div class="folder-warning" role="alert">
          <p>{translator.translate(FOLDER_WARNINGS[view.folderWarning])}</p>
          <button class="action" onclick={() => onCommand({ kind: 'acceptProtectedFolder' })}>
            {translator.translate('protectedNotes.folderWarning.keep')}
          </button>
          <button class="action" onclick={() => onCommand({ kind: 'lockProtectedNotes' })}>
            {translator.translate('protectedNotes.lock.button')}
          </button>
        </div>
      {:else}
        {#if isCreating}
          <input
            use:focusOnShow
            bind:value={newTitle}
            aria-label={translator.translate('protectedNotes.section.newNoteTitle')}
            autocomplete="off"
            spellcheck="false"
            onkeydown={handleTitleKeydown}
            onblur={() => (isCreating = false)}
          />
        {/if}
        {#if view.notes.length === 0}
          <p class="explanation">{translator.translate('protectedNotes.section.empty')}</p>
        {:else}
          <ul aria-labelledby="protected-notes-heading">
            {#each view.notes as note (note.noteId)}
              <li>
                <button
                  class="note"
                  aria-current={note.canonicalKey === activeDocumentKey ? 'page' : undefined}
                  onclick={() => onCommand({ kind: 'openProtectedNote', noteId: note.noteId })}
                >
                  {note.title}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
        {#if view.canUnlockOnThisPc}
          <button class="link" onclick={() => onCommand({ kind: 'forgetProtectedOnThisPc' })}>
            {translator.translate('protectedNotes.unlock.forgetThisPc')}
          </button>
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
    width: 100%;
    min-height: 24px;
    padding: 2px var(--space-2);
    overflow: hidden;
    border: 0;
    border-radius: var(--radius-small);
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .note:hover {
    background: var(--color-surface-hover);
  }

  .note[aria-current='page'] {
    background: var(--color-surface-selected, var(--color-surface-hover));
    font-weight: 600;
  }

  .note:focus-visible,
  .link:focus-visible,
  .header-action:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--color-focus);
  }

  .folder-warning {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-2);
    border-inline-start: 3px solid var(--color-alert-warning);
    background: var(--color-surface-raised);
  }

  .folder-warning p {
    margin: 0;
  }

  input {
    width: 100%;
    height: 26px;
    padding: 0 var(--space-2);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-small);
    background: var(--color-background);
    color: var(--color-text);
    font: inherit;
  }

  .link {
    justify-self: start;
    min-height: 24px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-accent);
    font: inherit;
    font-size: var(--text-size-small);
    text-decoration: underline;
  }

  .header-action {
    min-width: 24px;
    min-height: 24px;
    margin-inline-end: var(--space-1);
    padding: 0 var(--space-2);
    border: 0;
    border-radius: var(--radius-small);
    background: none;
    color: var(--color-text-secondary);
    font: inherit;
    font-size: 1.1em;
  }

  .header-action svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.3;
    stroke-linecap: round;
    vertical-align: -2px;
  }

  .header-action:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }
</style>
