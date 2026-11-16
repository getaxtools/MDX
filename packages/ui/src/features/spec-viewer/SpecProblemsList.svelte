<script lang="ts">
  import { failsCheck } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import type { FindingRow } from './specChangePage';

  interface Props {
    rows: readonly FindingRow[];
    translator: Translator;
    onOpenFinding: (documentPath: string, line: number | undefined) => void;
  }

  const { rows, translator, onOpenFinding }: Props = $props();

  let isStrict = $state(false);
  const isFailing = $derived(failsCheck(rows, isStrict));
</script>

<section class="problems" aria-labelledby="spec-problems-heading">
  <h2 id="spec-problems-heading">{translator.translate('specViewer.problems.title')}</h2>
  <label class="strict">
    <input type="checkbox" bind:checked={isStrict} />
    {translator.translate('specViewer.problems.strict')}
  </label>
  <p class="verdict" role="status">
    {translator.translate(isFailing ? 'specViewer.problems.fails' : 'specViewer.problems.passes')}
  </p>
  {#if rows.length === 0}
    <p>{translator.translate('specViewer.problems.none')}</p>
  {:else}
    <ul>
      {#each rows as row, index (index)}
        <li>
          <span class="severity" class:error={row.severity === 'error'}>
            {translator.translate(
              row.severity === 'error' ? 'specViewer.problems.error' : 'specViewer.problems.warning',
            )}
          </span>
          <span class="message">{row.message}</span>
          {#if row.documentPath}
            <button
              class="link"
              onclick={() => row.documentPath && onOpenFinding(row.documentPath, row.line)}
            >
              {row.place}
            </button>
          {:else}
            <span class="place">{row.place}</span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  <p class="notice">{translator.translate('specViewer.dashboard.subsetNotice')}</p>
</section>

<style>
  .problems h2 {
    margin: var(--space-3) 0 var(--space-2);
    font-size: calc(var(--text-size-body) * 1.15);
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    padding: var(--space-1) 0;
    border-block-end: 1px solid var(--color-border);
  }

  .severity {
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  .severity.error {
    color: var(--color-alert-caution);
  }

  .message {
    flex: 1 1 20em;
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-accent);
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }

  .link:focus-visible,
  .strict input:focus-visible {
    outline: 2px solid var(--color-focus);
  }

  .verdict,
  .notice {
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
  }
</style>
