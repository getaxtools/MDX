<script lang="ts">
  interface Props {
    kind: 'folder' | 'openFolder' | 'document';
  }

  const { kind }: Props = $props();
</script>

<svg class="tree-item-icon" viewBox="0 0 16 16" aria-hidden="true">
  {#if kind === 'document'}
    <path d="M4 1.5h5l3.5 3.5v9.5h-8.5z" />
    <path d="M9 1.5v3.5h3.5M6 8.5h4M6 11h4" />
  {:else if kind === 'openFolder'}
    <path d="M1.5 4v8.5h11l2-5.5h-11l-2 5.5" />
    <path d="M1.5 4v-1h4l1.5 1.5h5.5v2.5" />
  {:else}
    <path d="M1.5 3h4l1.5 1.5h7.5v8h-13z" />
  {/if}
</svg>

<style>
  .tree-item-icon {
    flex: none;
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.2;
    stroke-linejoin: round;
    color: var(--color-text-secondary);
  }
</style>
