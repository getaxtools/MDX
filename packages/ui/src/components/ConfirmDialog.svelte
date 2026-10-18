<script lang="ts">
  interface Props {
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
  }

  const { title, message, confirmLabel, cancelLabel, onConfirm, onCancel }: Props = $props();

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
    background: rgb(0 0 0 / 35%);
  }

  .dialog {
    max-width: 30rem;
    padding: var(--space-6);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-medium);
    background: var(--color-background);
    color: var(--color-text);
    font-size: var(--text-size-body);
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  h2 {
    margin-top: 0;
    font-size: 1.1rem;
  }

  .actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }

  button {
    padding: var(--space-1) var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-small);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
  }

  .primary {
    border-color: var(--color-accent);
    background: var(--color-accent);
    color: var(--color-accent-text);
  }

  button:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
  }
</style>
