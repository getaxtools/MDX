<script lang="ts">
  import type { Translator } from '@mdx/i18n';

  interface Props {
    message: string | undefined;
    translator: Translator;
    onDismiss: () => void;
  }

  const { message, translator, onDismiss }: Props = $props();
</script>

<div class="notice-region" role="status" aria-live="polite">
  {#if message}
    <div class="notice">
      <span>{message}</span>
      <button onclick={onDismiss}>{translator.translate('notice.dismiss')}</button>
    </div>
  {/if}
</div>

<style>
  .notice {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-2) var(--space-4);
    background: var(--color-notice-background);
    border-bottom: 1px solid var(--color-notice-border);
    font-size: var(--text-size-body);
  }

  button {
    border: 1px solid var(--color-notice-border);
    border-radius: var(--radius-small);
    background: none;
    color: var(--color-text);
    font: inherit;
    padding: var(--space-1) var(--space-3);
  }

  button:focus-visible {
    outline: 2px solid var(--color-focus);
  }
</style>
