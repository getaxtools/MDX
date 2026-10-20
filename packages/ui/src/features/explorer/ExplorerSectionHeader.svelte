<script lang="ts">
  import type { Snippet } from 'svelte';
  import TreeChevron from '../folder-tree/TreeChevron.svelte';

  interface Props {
    headingId: string;
    title: string;
    isExpanded: boolean;
    onToggle: () => void;
    actions?: Snippet;
  }

  const { headingId, title, isExpanded, onToggle, actions }: Props = $props();
</script>

<div class="section-header">
  <h2 id={headingId}>
    <button class="section-toggle" aria-expanded={isExpanded} onclick={onToggle}>
      <TreeChevron {isExpanded} />
      {title}
    </button>
  </h2>
  {@render actions?.()}
</div>

<style>
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-block-end: var(--space-1);
  }

  h2 {
    flex: 1;
    min-width: 0;
    margin: 0 !important;
  }

  .section-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    width: 100%;
    padding: var(--space-1);
    border: 0;
    border-radius: var(--radius-small);
    background: none;
    color: inherit;
    font: inherit;
    letter-spacing: inherit;
    text-align: start;
    text-transform: inherit;
  }

  .section-toggle:hover {
    background: var(--color-surface-hover);
  }

  .section-toggle:focus-visible {
    outline: 2px solid var(--color-focus);
  }
</style>
