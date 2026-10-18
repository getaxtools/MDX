<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import type { OutlineEntry } from '@mdx/renderer';
  import { scrollToHeading } from '../document-view/scrollToHeading';

  interface Props {
    outline: readonly OutlineEntry[];
    currentHeadingId?: string | undefined;
    translator: Translator;
  }

  const { outline, currentHeadingId, translator }: Props = $props();

  const INDENT_PER_LEVEL_REM = 0.75;
  const shallowestLevel = $derived(Math.min(...outline.map((entry) => entry.level)));
</script>

<nav class="outline" aria-labelledby="outline-heading">
  <h2 id="outline-heading">{translator.translate('outline.title')}</h2>
  {#if outline.length === 0}
    <p class="empty-state">{translator.translate('outline.emptyState')}</p>
  {:else}
    <ul>
      {#each outline as entry (entry.id)}
        <li style:padding-inline-start="{(entry.level - shallowestLevel) * INDENT_PER_LEVEL_REM}rem">
          <button
            title={entry.text}
            aria-current={entry.id === currentHeadingId ? 'location' : undefined}
            onclick={() => scrollToHeading(globalThis.document, entry.id)}
          >
            {entry.text}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</nav>

<style>
  .outline {
    width: 16rem;
    padding: var(--space-3) var(--space-2);
    border-inline-start: 1px solid var(--color-border);
    background: var(--color-surface);
    overflow-y: auto;
  }

  h2 {
    margin: 0 var(--space-2) var(--space-2);
    font-size: var(--text-size-small);
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  button {
    display: block;
    width: 100%;
    padding: var(--space-1) var(--space-2);
    border: 0;
    border-radius: var(--radius-small);
    background: none;
    color: var(--color-text);
    font: inherit;
    font-size: var(--text-size-body);
    text-align: start;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  button:hover {
    background: var(--color-surface-hover);
  }

  button[aria-current='location'] {
    background: var(--color-surface-selected);
    font-weight: 600;
  }

  button:focus-visible {
    outline: 2px solid var(--color-focus);
  }

  .empty-state {
    margin: 0 var(--space-2);
    font-size: var(--text-size-small);
    color: var(--color-text-secondary);
  }
</style>
