<script lang="ts">
  import { noteNameOf } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import type { Backlink } from '@mdx/platform';
  import type { NotesLinkCommand } from './NotesIndexActions';

  interface Props {
    backlinks: readonly Backlink[];
    /** The shown note's name, which the opened note is searched for. */
    noteName: string;
    translator: Translator;
    onCommand: (command: NotesLinkCommand) => void;
  }

  const { backlinks, noteName, translator, onCommand }: Props = $props();

  function fileNameOf(path: string): string {
    return path.split('/').at(-1) ?? path;
  }
</script>

<section class="backlinks" aria-labelledby="note-backlinks-heading">
  <h2 id="note-backlinks-heading">
    {translator.translate('notes.backlinks.title', { count: backlinks.length })}
  </h2>
  {#if backlinks.length === 0}
    <p class="empty">{translator.translate('notes.backlinks.empty')}</p>
  {:else}
    <ul>
      {#each backlinks as backlink (`${backlink.path}:${String(backlink.lineNumber)}`)}
        <li>
          <button onclick={() => onCommand({ kind: 'openBacklink', path: backlink.path, noteName })}>
            <span class="note">{noteNameOf(fileNameOf(backlink.path))}</span>
            <span class="line">{backlink.line}</span>
            <span class="visually-hidden"
              >{translator.translate('folderSearch.line', { number: backlink.lineNumber })}</span
            >
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .backlinks {
    max-width: var(--reading-measure, 72ch);
    margin: var(--space-6) auto var(--space-4);
    padding: var(--space-3) var(--space-4) 0;
    border-top: 1px solid var(--color-border);
  }

  h2 {
    margin: 0 0 var(--space-2);
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
    font-weight: 600;
  }

  .empty {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  button {
    display: grid;
    width: 100%;
    padding: var(--space-1) var(--space-2);
    border: 0;
    border-radius: var(--radius-xsmall);
    background: none;
    color: var(--color-text);
    font: inherit;
    text-align: start;
  }

  button:hover {
    background: var(--color-surface-hover);
  }

  button:focus-visible {
    outline: 2px solid var(--color-focus);
  }

  .note {
    font-weight: 600;
  }

  .line {
    overflow: hidden;
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
