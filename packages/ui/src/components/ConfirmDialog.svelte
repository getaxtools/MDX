<script lang="ts">
  interface Props {
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
    /** A third choice between confirming and cancelling, such as Don't Save. */
    alternative?: { readonly label: string; readonly onChoose: () => void } | undefined;
  }

  const { title, message, confirmLabel, cancelLabel, onConfirm, onCancel, alternative }: Props = $props();

  let cancelButton: HTMLButtonElement | undefined = $state();

  $effect(() => cancelButton?.focus());

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onCancel();
  }
</script>

<div class="backdrop">
  <div
    class="dialog"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="confirm-title"
    aria-describedby="confirm-message"
    tabindex="-1"
    onkeydown={handleKeydown}
  >
    <h2 id="confirm-title">{title}</h2>
    <p id="confirm-message">{message}</p>
    <div class="actions">
      <button class="primary" onclick={onConfirm}>{confirmLabel}</button>
      {#if alternative}
        <button onclick={alternative.onChoose}>{alternative.label}</button>
      {/if}
      <button bind:this={cancelButton} onclick={onCancel}>{cancelLabel}</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
    background: var(--color-overlay);
  }

  .dialog {
    animation: rise-in var(--motion-fast) var(--easing-standard);
    max-width: 30rem;
    padding: var(--space-5);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xlarge);
    background: var(--color-surface-raised);
    box-shadow: var(--shadow-medium);
    color: var(--color-text);
    font-size: var(--text-size-body);
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  h2 {
    margin: 0 0 var(--space-2);
    font-size: 1rem;
    font-weight: 600;
  }

  p {
    margin: 0 0 var(--space-5);
    color: var(--color-text-secondary);
  }

  .actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
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

  button:hover:not(:disabled) {
    background: var(--color-surface-hover);
  }

  .primary:not(:disabled) {
    border-color: transparent;
    background: var(--color-accent);
    color: var(--color-accent-text);
  }

  .primary:hover:not(:disabled) {
    background: var(--color-accent-hover);
  }

  button:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
  }

  @keyframes rise-in {
    from {
      opacity: 0;
      transform: scale(0.98);
    }
  }
</style>
