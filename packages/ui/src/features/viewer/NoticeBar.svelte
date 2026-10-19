<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import type { NoticeAction } from './ViewerController';

  interface Props {
    message: string | undefined;
    actions?: readonly NoticeAction[] | undefined;
    translator: Translator;
    onAction?: (action: NoticeAction) => void;
    onDismiss: () => void;
  }

  const { message, actions = [], translator, onAction = () => undefined, onDismiss }: Props = $props();
</script>

<div class="notice-region" role="status" aria-live="polite">
  {#if message}
    <div class="notice">
      <span>{message}</span>
      <div class="actions">
        {#each actions as action (action.label)}
          <button onclick={() => onAction(action)}>{action.label}</button>
        {/each}
        <button onclick={onDismiss}>{translator.translate('notice.dismiss')}</button>
      </div>
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

  .actions {
    display: flex;
    flex-shrink: 0;
    gap: var(--space-2);
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
