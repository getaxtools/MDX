<script lang="ts">
  import type { InjectionSeverity } from '@mdx/core';

  interface Props {
    severity: InjectionSeverity;
  }

  const { severity }: Props = $props();
</script>

<!-- Each severity has its own shape, so it does not rely on colour alone. -->
<svg class="severity-icon" data-severity={severity} viewBox="0 0 16 16" aria-hidden="true">
  {#if severity === 'high'}
    <path d="M5.2 1.5h5.6l3.7 3.7v5.6l-3.7 3.7H5.2l-3.7-3.7V5.2z" />
    <path class="mark" d="M8 4.5v4.5M8 11v.5" />
  {:else if severity === 'medium'}
    <path d="M8 1.8l6.7 12H1.3z" />
    <path class="mark" d="M8 6v4M8 11.8v.4" />
  {:else if severity === 'low'}
    <circle cx="8" cy="8" r="6.2" />
    <path class="mark" d="M5.5 8h5" />
  {:else}
    <circle cx="8" cy="8" r="6.2" />
    <path class="mark" d="M8 7v4.5M8 4.6v.4" />
  {/if}
</svg>

<style>
  .severity-icon {
    flex: none;
    width: 1rem;
    height: 1rem;
    fill: currentColor;
    stroke: none;
  }

  .mark {
    fill: none;
    stroke: var(--color-background);
    stroke-width: 1.6;
    stroke-linecap: round;
  }

  [data-severity='high'] {
    color: var(--color-alert-caution);
  }

  [data-severity='medium'] {
    color: var(--color-alert-warning);
  }

  [data-severity='low'] {
    color: var(--color-alert-note);
  }

  [data-severity='info'] {
    color: var(--color-text-secondary);
  }

  @media (forced-colors: active) {
    .severity-icon {
      color: CanvasText;
    }

    .mark {
      stroke: Canvas;
    }
  }
</style>
