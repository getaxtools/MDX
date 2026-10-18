<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import Dialog from '../../components/Dialog.svelte';
  import { describeCombination } from '../shortcuts/describeCombination';
  import { KEYBOARD_SHORTCUTS } from './keyboardShortcuts';

  interface Props {
    translator: Translator;
    onClose: () => void;
  }

  const { translator, onClose }: Props = $props();
</script>

<Dialog
  title={translator.translate('menu.help.keyboardShortcuts')}
  closeLabel={translator.translate('about.close')}
  {onClose}
>
  <table>
    <thead>
      <tr>
        <th scope="col">{translator.translate('shortcuts.column.action')}</th>
        <th scope="col">{translator.translate('shortcuts.column.keys')}</th>
      </tr>
    </thead>
    <tbody>
      {#each KEYBOARD_SHORTCUTS as shortcut (shortcut.actionKey)}
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
</Dialog>

<style>
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
