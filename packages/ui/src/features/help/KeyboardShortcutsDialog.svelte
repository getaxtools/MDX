<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import Dialog from '../../components/Dialog.svelte';
  import { COMMAND_SHORTCUTS, shortcutLabelFor, type CommandShortcut } from '../shortcuts/commandShortcuts';
  import { describeCombination } from '../shortcuts/describeCombination';
  import { keyboardShortcutsWith, matchingShortcuts } from './keyboardShortcuts';

  interface Props {
    translator: Translator;
    /** The keys each command has now, including the user's changes. */
    shortcuts?: readonly CommandShortcut[];
    onClose: () => void;
  }

  const { translator, shortcuts = COMMAND_SHORTCUTS, onClose }: Props = $props();

  let query = $state('');
  let searchInput: HTMLInputElement | undefined = $state();

  $effect(() => searchInput?.focus());

  const shownShortcuts = $derived(matchingShortcuts(query, translator, keyboardShortcutsWith(shortcuts)));
  const wheelShortcut = $derived(shortcutLabelFor({ kind: 'toggleControlWheel' }, translator, shortcuts));
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
            {:else}
              {translator.translate('shortcuts.none')}
            {/each}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if shownShortcuts.length === 0}
    <p class="no-matches" role="status">{translator.translate('shortcuts.noMatches', { query })}</p>
  {/if}
  <p class="mouse-button-help">
    {wheelShortcut
      ? translator.translate('help.controlWheel.mouseButton', { shortcut: wheelShortcut })
      : translator.translate('help.controlWheel.mouseButtonWithoutShortcut')}
  </p>
</Dialog>

<style>
  .search {
    box-sizing: border-box;
    width: 100%;
    margin-bottom: var(--space-3);
    height: 32px;
    padding: 0 var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-medium);
    background: var(--color-background);
    color: var(--color-text);
    font: inherit;
  }

  .search::placeholder {
    color: var(--color-text-tertiary);
  }

  .search:focus {
    border-color: var(--color-focus);
  }

  :is(.no-matches, .mouse-button-help) {
    color: var(--color-text-secondary);
  }

  .mouse-button-help {
    margin-bottom: 0;
    font-size: var(--text-size-small);
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
    padding: 6px var(--space-3) 6px 0;
    border-bottom: 1px solid var(--color-border);
  }

  kbd {
    padding: 0 var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xsmall);
    background: var(--color-surface);
    box-shadow: inset 0 -1px 0 var(--color-border);
    font-family: var(--font-ui);
    font-size: var(--text-size-small);
    white-space: nowrap;
  }
</style>
