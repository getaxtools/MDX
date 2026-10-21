<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import Dialog from '../../components/Dialog.svelte';
  import { describeCombination } from '../shortcuts/describeCombination';
  import { matchingShortcuts } from './keyboardShortcuts';

  interface Props {
    translator: Translator;
    onClose: () => void;
  }

  const { translator, onClose }: Props = $props();

  let query = $state('');
  let searchInput: HTMLInputElement | undefined = $state();

  $effect(() => searchInput?.focus());

  const shownShortcuts = $derived(matchingShortcuts(query, translator));
</script>

<Dialog
  title={translator.translate('menu.help.keyboardShortcuts')}
  closeLabel={translator.translate('about.close')}
  {onClose}
>
  <input
    bind:this={searchInput}
    bind:value={query}
    class="search"
    type="search"
    aria-label={translator.translate('shortcuts.search.label')}
    placeholder={translator.translate('shortcuts.search.label')}
  />
  <table>
    <thead>
      <tr>
        <th scope="col">{translator.translate('shortcuts.column.action')}</th>
        <th scope="col">{translator.translate('shortcuts.column.keys')}</th>
      </tr>
    </thead>
    <tbody>
      {#each shownShortcuts as shortcut (shortcut.actionKey)}
        <tr>
          <td>{translator.translate(shortcut.actionKey).replace('…', '')}</td>
          <td>
            {#each shortcut.combinations as combination, index (index)}
              {#if index > 0},
              {/if}<kbd>{describeCombination(combination, translator)}</kbd>
            {/each}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if shownShortcuts.length === 0}
    <p class="no-matches" role="status">{translator.translate('shortcuts.noMatches', { query })}</p>
  {/if}
</Dialog>

<style>
  .search {
    box-sizing: border-box;
    width: 100%;
    margin-bottom: var(--space-3);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-small);
    background: var(--color-background);
    color: var(--color-text);
    font: inherit;
  }

  .no-matches {
    color: var(--color-text-secondary);
  }

  .search:focus-visible {
    outline: 2px solid var(--color-focus);
  }

  table {
    border-collapse: collapse;
    width: 100%;
  }

  th {
    text-align: start;
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
    font-weight: 600;
  }

  :is(th, td) {
    padding: var(--space-1) var(--space-3) var(--space-1) 0;
    border-bottom: 1px solid var(--color-border);
  }

  kbd {
    padding: 0 var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-small);
    background: var(--color-surface);
    font-family: var(--font-ui);
    font-size: var(--text-size-small);
    white-space: nowrap;
  }
</style>
