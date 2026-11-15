<script lang="ts">
  import type { WorkspaceKindId } from '@mdx/core';
  import type { Translator } from '@mdx/i18n';
  import { kindDescriptionOf, kindNameOf } from './kindPresentation';
  import type { WheelPhase } from './wheelMotion';
  import type { CaptionSide } from './wheelPlacement';

  interface Props {
    kindId: WorkspaceKindId;
    /** The segment's position on the ring, which is also the number key that chooses it. */
    number: number;
    side: CaptionSide;
    isSurfaceOpaque: boolean;
    phase: WheelPhase;
    translator: Translator;
  }

  const { kindId, number, side, isSurfaceOpaque, phase, translator }: Props = $props();
</script>

<!-- Screen readers already hear the segment's name and position, so the caption is for the eyes only. -->
<div
  class="caption"
  data-testid="wheel-caption"
  class:is-reopened={phase === 'reopened'}
  class:is-closing={phase === 'closing'}
  data-side={side}
  data-surface={isSurfaceOpaque ? 'opaque' : 'frosted'}
  aria-hidden="true"
>
  <span class="name">{kindNameOf(kindId, translator)} <kbd>{number}</kbd></span>
  <span class="description">{kindDescriptionOf(kindId, translator)}</span>
</div>

<style>
  .caption {
    position: absolute;
    inset-inline: 0;
    display: grid;
    justify-items: center;
    width: max-content;
    max-width: calc(100% + 2 * var(--space-4));
    margin-inline: auto;
    padding: var(--space-1) var(--space-3);
    border: 1px solid color-mix(in srgb, var(--color-border-strong) 70%, transparent);
    border-radius: var(--radius-large);
    background: color-mix(in srgb, var(--color-wheel-surface) var(--wheel-surface-opacity), transparent);
    backdrop-filter: var(--wheel-surface-backdrop);
    box-shadow: var(--shadow-wheel);
    text-align: center;
    pointer-events: none;
  }

  .caption[data-side='above'] {
    inset-block-end: calc(100% + var(--space-2));
  }

  .caption[data-side='below'] {
    inset-block-start: calc(100% + var(--space-2));
  }

  .caption[data-surface='opaque'] {
    background: var(--color-wheel-surface);
    backdrop-filter: none;
  }

  .name {
    display: flex;
    gap: var(--space-1);
    align-items: center;
    color: var(--color-text);
    font-size: var(--text-size-body);
    font-weight: 600;
  }

  kbd {
    min-width: 0.875rem;
    padding-inline: var(--space-1);
    border: 1px solid color-mix(in srgb, var(--color-text-secondary) 50%, transparent);
    border-radius: var(--radius-xsmall);
    color: var(--color-text);
    font-family: inherit;
    font-size: 0.625rem;
    font-variant-numeric: tabular-nums;
    font-weight: normal;
    line-height: 0.875rem;
  }

  .description {
    color: var(--color-text);
    font-size: var(--text-size-small);
  }

  @media (prefers-reduced-motion: no-preference) {
    .caption {
      animation: caption-in var(--surface-duration) var(--easing-emphasized) both;
    }

    .caption.is-reopened {
      animation: none;
    }

    .caption.is-closing {
      animation: caption-out var(--close-duration) ease-in both;
    }
  }

  @keyframes caption-in {
    from {
      opacity: 0;
      scale: 0.92;
    }
  }

  @keyframes caption-out {
    to {
      opacity: 0;
      scale: 0.96;
    }
  }

  @media (forced-colors: active) {
    .caption {
      border-color: CanvasText;
      box-shadow: none;
    }

    kbd {
      border-color: CanvasText;
    }
  }
</style>
