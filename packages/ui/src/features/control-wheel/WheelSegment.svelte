<script lang="ts">
  import type { RingPoint, WorkspaceKindId } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import KindIcon from './KindIcon.svelte';
  import { CHECK_ICON, KIND_ICONS, kindColourOf, kindNameOf } from './kindPresentation';
  import type { MotionStep, WheelPhase } from './wheelMotion';

  interface Props {
    element?: HTMLElement | undefined;
    kindId: WorkspaceKindId;
    /** Position on the ring from 0, in reading order. */
    index: number;
    /** Where the icon sits, as a percentage of the wheel's size from its top left corner. */
    position: RingPoint;
    isActive: boolean;
    isLit: boolean;
    isFocusable: boolean;
    step: MotionStep | undefined;
    /** A CSS translate value that moves a lit segment outward, or nothing to keep it in place. */
    lift: string | undefined;
    iconScale: number | undefined;
    phase: WheelPhase;
    translator: Translator;
    onFocus: () => void;
  }

  let {
    element = $bindable(),
    kindId,
    index,
    position,
    isActive,
    isLit,
    isFocusable,
    step,
    lift,
    iconScale,
    phase,
    translator,
    onFocus,
  }: Props = $props();

  const name = $derived(kindNameOf(kindId, translator));
</script>

<!-- The menu around the segments handles their keys and clicks, so a segment only reports its focus. -->
<div
  bind:this={element}
  class="segment"
  class:is-reopened={phase === 'reopened'}
  role="menuitemradio"
  tabindex={isFocusable ? 0 : -1}
  aria-label={name}
  aria-checked={isActive}
  aria-keyshortcuts={String(index + 1)}
  title={translator.translate('controlWheel.segment.tooltip', { kind: name, number: index + 1 })}
  data-segment={index}
  data-lit={isLit}
  style:left="{position.x}%"
  style:top="{position.y}%"
  style:--kind-colour={kindColourOf(kindId)}
  style:--segment-delay="{step?.delayMs ?? 0}ms"
  style:--segment-duration="{step?.durationMs ?? 0}ms"
  style:--lift={lift}
  onfocus={onFocus}
>
  <span class="icon" style:--icon-scale={iconScale}><KindIcon paths={KIND_ICONS[kindId]} /></span>
  {#if isActive}
    <span class="check"><KindIcon paths={CHECK_ICON} /></span>
  {/if}
</div>

<style>
  .segment {
    position: absolute;
    display: grid;
    place-items: center;
    width: 22%;
    height: 22%;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    translate: var(--lift, none);
    color: var(--kind-colour);
    outline: none;
  }

  .icon {
    display: grid;
    scale: var(--icon-scale, none);
  }

  .icon :global(svg) {
    width: 1.375rem;
    height: 1.375rem;
    stroke-width: 1.75;
  }

  .check {
    position: absolute;
    inset-block-start: 0;
    inset-inline-end: 0;
    display: grid;
    place-items: center;
    width: 1rem;
    height: 1rem;
    border-radius: 50%;
    background: var(--kind-colour);
    color: var(--color-wheel-tile);
  }

  .check :global(svg) {
    width: 0.75rem;
    height: 0.75rem;
    stroke-width: 2.4;
  }

  @media (prefers-reduced-motion: no-preference) {
    .segment {
      animation: segment-in var(--segment-duration) var(--easing-emphasized) var(--segment-delay) both;
      transition: translate var(--motion-fast) var(--easing-standard);
    }

    .segment.is-reopened {
      animation: none;
    }

    .icon {
      transition: scale var(--motion-fast) var(--easing-standard);
    }
  }

  @keyframes segment-in {
    from {
      opacity: 0;
      scale: 0.8;
    }
  }

  @media (forced-colors: active) {
    .check {
      background: Highlight;
      color: HighlightText;
    }
  }
</style>
