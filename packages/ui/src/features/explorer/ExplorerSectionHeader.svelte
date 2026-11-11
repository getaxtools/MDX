<script lang="ts">
  import type { ExplorerSection } from '@mdx/core';
  import type { Snippet } from 'svelte';
  import TreeChevron from '../folder-tree/TreeChevron.svelte';

  interface Props {
    section: ExplorerSection;
    headingId: string;
    title: string;
    isExpanded: boolean;
    onToggle: () => void;
    actions?: Snippet;
  }

  const { section, headingId, title, isExpanded, onToggle, actions }: Props = $props();
</script>

<div class="section-header">
  <h2 id={headingId}>
    <button class="section-toggle" aria-expanded={isExpanded} onclick={onToggle}>
      <TreeChevron {isExpanded} />
      <svg class="section-icon" viewBox="0 0 24 24" aria-hidden="true">
        {#if section === 'favourites'}
          <path d="M12 4l2.4 5 5.4.7-4 3.8 1 5.4-4.8-2.6-4.8 2.6 1-5.4-4-3.8 5.4-.7z" />
        {:else if section === 'folders'}
          <path
            d="M3.5 18.5v-12A1.5 1.5 0 0 1 5 5h4.2l2 2.2H19a1.5 1.5 0 0 1 1.5 1.5v9.8A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5z"
          />
        {:else}
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        {/if}
      </svg>
      <span class="section-title">{title}</span>
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
    gap: 6px;
    width: 100%;
    min-height: 28px;
    padding: 0 var(--space-1);
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

  .section-icon {
    flex: none;
    width: 16px;
    height: 16px;
    fill: none;
    stroke: var(--color-accent);
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
  }

  .section-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
