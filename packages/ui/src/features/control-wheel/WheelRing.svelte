<script lang="ts">
  import { rimArcPath, sectorPath, type RingLayout, type RingSector, type WorkspaceKindId } from '@mdx/core';
  import { kindColourOf } from './kindPresentation';
  import { liftTranslation, RIM_RADIUS, RIM_WIDTH, SECTOR_SHAPE } from './wheelDimensions';
  import type { WheelMotion, WheelPhase } from './wheelMotion';

  interface Props {
    layout: RingLayout;
    /** The kind of each sector, in ring order. */
    kindIds: readonly WorkspaceKindId[];
    activeKindId: WorkspaceKindId;
    litIndex: number;
    /** The segment that shows the keyboard focus outline, if any. */
    focusOutlineIndex: number | undefined;
    confirmedIndex: number | undefined;
    motion: WheelMotion;
    phase: WheelPhase;
    /** A lit segment then changes colour only, without moving. */
    isMotionReduced: boolean;
  }

  const {
    layout,
    kindIds,
    activeKindId,
    litIndex,
    focusOutlineIndex,
    confirmedIndex,
    motion,
    phase,
    isMotionReduced,
  }: Props = $props();

  /** The ring is drawn in view units, where a pixel in `translate` is one unit. */
  function liftValue(sector: RingSector): string | undefined {
    if (sector.index !== litIndex || isMotionReduced) return undefined;
    return liftTranslation(sector, layout, 1);
  }
</script>

<svg
  class="ring"
  class:is-reopened={phase === 'reopened'}
  viewBox="-100 -100 200 200"
  aria-hidden="true"
  style:--rim-width={RIM_WIDTH}
>
  {#each layout.sectors as sector (sector.index)}
    {@const kindId = kindIds[sector.index]}
    {#if kindId}
      {@const step = motion.segments[sector.index]}
      <g
        class="segment-tile"
        class:is-confirmed={sector.index === confirmedIndex}
        style:--kind-colour={kindColourOf(kindId)}
        style:--segment-delay="{step?.delayMs ?? 0}ms"
        style:--segment-duration="{step?.durationMs ?? 0}ms"
        style:--lift={liftValue(sector)}
      >
        <path
          class="tile"
          class:is-active={kindId === activeKindId}
          class:is-lit={sector.index === litIndex}
          class:is-focused={sector.index === focusOutlineIndex}
          class:is-confirmed={sector.index === confirmedIndex}
          d={sectorPath(sector, layout, SECTOR_SHAPE)}
        />
        {#if kindId === activeKindId}
          <path
            class="rim"
            data-testid="rim-arc"
            d={rimArcPath(sector, layout, { radius: RIM_RADIUS, shape: SECTOR_SHAPE })}
          />
        {/if}
      </g>
    {/if}
  {/each}
</svg>

<style>
  .ring {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .segment-tile {
    transform-box: view-box;
    transform-origin: center;
    translate: var(--lift, none);
  }

  .tile {
    fill: var(--color-wheel-tile);
    fill-rule: evenodd;
    stroke: var(--color-wheel-tile-edge);
    stroke-width: 1;
  }

  .tile.is-active {
    fill: color-mix(in srgb, var(--kind-colour) 10%, var(--color-wheel-tile));
  }

  .tile.is-lit {
    fill: color-mix(in srgb, var(--kind-colour) 16%, var(--color-wheel-tile));
  }

  .tile.is-confirmed {
    fill: color-mix(in srgb, var(--kind-colour) 28%, var(--color-wheel-tile));
  }

  .tile.is-focused {
    stroke: var(--color-focus);
    stroke-width: 3;
  }

  .rim {
    fill: none;
    stroke: var(--kind-colour);
    stroke-linecap: butt;
    stroke-width: var(--rim-width);
  }

  @media (prefers-reduced-motion: no-preference) {
    .segment-tile {
      animation: segment-in var(--segment-duration) var(--easing-emphasized) var(--segment-delay) both;
      transition: translate var(--motion-fast) var(--easing-standard);
    }

    .ring.is-reopened .segment-tile {
      animation: none;
    }

    .segment-tile.is-confirmed {
      animation: segment-confirm var(--confirm-duration) ease-out both;
    }
  }

  @keyframes segment-in {
    from {
      opacity: 0;
      scale: 0.8;
    }
  }

  @keyframes segment-confirm {
    50% {
      scale: 1.06;
    }
  }

  @media (forced-colors: active) {
    .ring {
      forced-color-adjust: none;
    }

    .tile,
    .tile.is-active,
    .tile.is-lit,
    .tile.is-confirmed {
      fill: Canvas;
      stroke: CanvasText;
      stroke-width: 1;
    }

    .tile.is-lit {
      stroke-width: 2.5;
    }

    .tile.is-focused {
      stroke: Highlight;
      stroke-width: 4;
    }

    .rim {
      stroke: Highlight;
      stroke-width: 4;
    }
  }
</style>
