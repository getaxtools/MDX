<script lang="ts">
  import { sectorPointAt, type RingLayout } from '@mdx/core';
  import { KEY_CAP_RADIUS, percentPositionOf } from './wheelDimensions';

  interface Props {
    layout: RingLayout;
  }

  const { layout }: Props = $props();
</script>

<!-- Screen readers already hear each number as the segment's position and shortcut. -->
<div class="key-caps" aria-hidden="true">
  {#each layout.sectors as sector (sector.index)}
    {@const position = percentPositionOf(sectorPointAt(sector, KEY_CAP_RADIUS))}
    <span class="key-cap" style:left="{position.x}%" style:top="{position.y}%">{sector.index + 1}</span>
  {/each}
</div>

<style>
  .key-caps {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .key-cap {
    position: absolute;
    box-sizing: border-box;
    min-width: 0.875rem;
    height: 0.875rem;
    padding-inline: 3px;
    border: 1px solid color-mix(in srgb, var(--color-text-secondary) 50%, transparent);
    border-radius: var(--radius-xsmall);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    font-size: 0.625rem;
    font-variant-numeric: tabular-nums;
    line-height: 0.75rem;
    text-align: center;
    transform: translate(-50%, -50%);
  }

  @media (forced-colors: active) {
    .key-cap {
      border-color: CanvasText;
      background: Canvas;
      color: CanvasText;
    }
  }
</style>
