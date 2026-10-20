<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    closeLabel: string;
    onClose: () => void;
    children: Snippet;
  }

  const { title, closeLabel, onClose, children }: Props = $props();

  let closeButton: HTMLButtonElement | undefined = $state();

  $effect(() => closeButton?.focus());

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onClose();
  }
</script>

<div class="backdrop">
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="dialog-title"
    tabindex="-1"
    onkeydown={handleKeydown}
  >
    <h2 id="dialog-title">{title}</h2>
    <!-- Long content scrolls, so keyboard users must be able to focus it to scroll it (WCAG 2.1.1). -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="content" role="region" aria-labelledby="dialog-title" tabindex="0">{@render children()}</div>
    <div class="actions">
      <button bind:this={closeButton} onclick={onClose}>{closeLabel}</button>
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
    display: flex;
    flex-direction: column;
    max-width: 34rem;
    max-height: 85vh;
    padding: var(--space-6);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-medium);
    background: var(--color-background);
    color: var(--color-text);
    font-size: var(--text-size-body);
    line-height: 1.5;
  }

  h2 {
    margin-top: 0;
  }

  .content {
    overflow-y: auto;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: var(--space-4);
  }

  button {
    padding: var(--space-1) var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-small);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
  }

  button:focus-visible,
  .content:focus-visible {
    outline: 2px solid var(--color-focus);
  }
</style>
