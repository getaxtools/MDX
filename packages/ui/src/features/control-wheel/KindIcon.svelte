<script lang="ts">
  import type { IconPaths } from './kindPresentation';

  interface Props {
    paths: IconPaths;
  }

  const { paths }: Props = $props();
</script>

<svg viewBox="0 0 24 24" aria-hidden="true">
  {#each paths as path (path)}
    <path d={path} />
  {/each}
</svg>

<style>
  svg {
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentcolor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.6;
  }
</style>
