<script lang="ts">
  import type { Translator } from '@mdx/i18n';
  import Dialog from './Dialog.svelte';

  interface Props {
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    translator: Translator;
    onConfirm: () => void;
    onCancel: () => void;
    /** A third choice between confirming and cancelling, such as Don't Save. */
    alternative?: { readonly label: string; readonly onChoose: () => void } | undefined;
  }

  const { title, message, confirmLabel, cancelLabel, translator, onConfirm, onCancel, alternative }: Props =
    $props();
</script>

{#snippet alternativeChoice()}
  {#if alternative}
    <button type="button" onclick={alternative.onChoose}>{alternative.label}</button>
  {/if}
{/snippet}

<Dialog
  {title}
  closeLabel={translator.translate('dialog.close.label')}
  closeTooltip={translator.translate('dialog.close.tooltip')}
  {cancelLabel}
  primary={{ label: confirmLabel, onActivate: onConfirm }}
  shouldStartOnCancel
  isAlert
  footer={alternative ? alternativeChoice : undefined}
  onClose={onCancel}
>
  <p>{message}</p>
</Dialog>

<style>
  p {
    max-width: 30rem;
    margin: 0;
    color: var(--color-text-secondary);
    overflow-wrap: anywhere;
  }

  button {
    height: 32px;
    padding: 0 var(--space-4);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-medium);
    background: var(--color-surface-raised);
    color: var(--color-text);
    font: inherit;
    font-weight: 500;
    transition: background-color var(--motion-fast) ease-out;
  }

  button:hover {
    background: var(--color-surface-hover);
  }

  button:focus-visible {
    outline: 2px solid var(--color-focus);
  }
</style>
