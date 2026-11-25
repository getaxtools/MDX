<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    closeLabel: string;
    onClose: () => void;
    children: Snippet;
    /** More controls for the fixed footer, shown before the close button. */
    footer?: Snippet;
    /** False while the dialog must be finished, not closed: it then has no close button and ignores Escape. */
    canClose?: boolean;
  }

  const { title, closeLabel, onClose, children, footer, canClose = true }: Props = $props();

  let closeButton: HTMLButtonElement | undefined = $state();

  $effect(() => closeButton?.focus());

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !canClose) return;
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
      {@render footer?.()}
      {#if canClose}
        <button bind:this={closeButton} onclick={onClose}>{closeLabel}</button>
      {/if}
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
    animation: fade-in var(--motion-fast) var(--easing-standard);
    display: flex;
    flex-direction: column;
    max-width: 34rem;
    max-height: 85vh;
    padding: var(--space-5);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xlarge);
    background: var(--color-surface-raised);
    box-shadow: var(--shadow-medium);
    color: var(--color-text);
    font-size: var(--text-size-body);
    line-height: 1.5;
  }

  h2 {
    margin: 0 0 var(--space-3);
    font-size: 1rem;
    font-weight: 600;
  }

  .content {
    overflow-y: auto;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-4);
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

  button:focus-visible,
  .content:focus-visible {
    outline: 2px solid var(--color-focus);
  }

  @media (prefers-reduced-motion: no-preference) {
    .dialog {
      animation: rise-in var(--motion-fast) var(--easing-standard);
    }
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }

  @keyframes rise-in {
    from {
      opacity: 0;
      transform: scale(0.98);
    }
  }
</style>
